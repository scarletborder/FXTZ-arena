import Phaser from "phaser";
import { t } from "@repo/i18n";
import type { PlayerId } from "@repo/types";
import {
  createRaidLogicRuntime,
  type BattleInputState,
  type BattleOutputFrame,
  type RaidLogicRuntime,
} from "@repo/raid-logic";

import {
  ARENA_HEIGHT_PX,
  ARENA_WIDTH_PX,
  FIXED_STEP_MS,
  GAME_HEIGHT,
  GAME_WIDTH,
} from "@repo/constants";
import type { PointRewardSize } from "@repo/constants";
import { createBattleInput, getBattlePointerWorld } from "./battle/input";
import {
  createBattleKeybinds,
  type BattleKeybinds,
  type BattleKeyMap,
} from "./battle/keybind";
import { BattleRollbackManager, type BattleHashBundle } from "./battle/rollback-manager";
import type { BattleSceneData, BattleLoadouts } from "./battle/loadout";
import {
  BattleMobileControls,
  shouldEnableMobileBattleControls,
} from "./battle/keybind";
import { BattleView } from "./battle/view";
import { BattlePauseMenuController } from "./battle/view/pause";
import { Depth } from "./utils/depth";
import ConsoleCmd, { type DebugHashRow } from "./commands/ConsoleCmd";
import BgmCmd from "./commands/BgmCmd";
import { connectionManager } from "./menu/shared";
import { installBattleAudioBridge, installBattleBgmBridge, type BattleAudioBridge, type BattleBgmBridge } from "./sound";
import { CombatSyncManager } from "./network/combat";
import { P2pConnection } from "./network/p2p";
import { uiSettings } from "./store/settings";
import { BattleAudioDirector } from "./battle/audio";
import { resolveResultWinnerName } from "./battle/result";
import { advanceStoryAfterBattle } from "./story/state";
import type { StoryProgressData, StoryResultData } from "./story/types";
import type { ReplayFile } from "./replay/types";
import { ReplayBattleOverride } from "./replay/replay-battle-override";
import { ReplayRecorder, globalReplayRecorder } from "./replay/recorder";
import { SpectatorBattleOverride } from "./replay/spectator/spectator-battle-override";

type DebugPointSize = "small" | "medium" | "large";

function pointRewardSizeForDebugSize(size: DebugPointSize): PointRewardSize {
  switch (size) {
    case "small":
      return "small";
    case "medium":
      return "medium";
    case "large":
      return "large";
  }
}

const PRESET_SCRIPT_ROLLBACK_FRAME = 30;
const PRESET_SCRIPT_FRAMES = 420;
const ARENA_ASPECT_RATIO = ARENA_WIDTH_PX / ARENA_HEIGHT_PX;

interface BattleLayout {
  readonly width: number;
  readonly height: number;
  readonly arenaInsetX: number;
  readonly arenaInsetY: number;
}

export class BattleScene extends Phaser.Scene {
  private accumulator = 0;
  private keybinds!: BattleKeybinds;
  private keys!: BattleKeyMap;
  private runtime!: RaidLogicRuntime;
  private currentOutput!: BattleOutputFrame;
  private logicReady = false;
  private view!: BattleView;
  private debugInputLocked = false;
  private debugLiveHashEnabled = false;
  private debugPhysicsEnabled = false;
  private resultScheduled = false;
  private sceneData: BattleSceneData = {};
  private readonly rollbackManager = new BattleRollbackManager({ sceneData: {}, debug: false });
  private lastInput!: BattleInputState & {
    readonly pointerX: number;
    readonly pointerY: number;
  };
  private autoReloadObservedShotsFired = 0;
  private combatSync: CombatSyncManager | undefined;
  private onlineStatusText: Phaser.GameObjects.Text | undefined;
  private mobileControls: BattleMobileControls | undefined;
  private mobileControlsEnabled = false;
  private previousScaleAutoCenter: Phaser.Scale.CenterType | undefined;
  private battleLayout: BattleLayout | undefined;
  private applyingBattleLayout = false;
  private pendingLayoutRefresh: Phaser.Time.TimerEvent | undefined;
  private rollbackVisualFrames = 0;
  private readonly audioDirector = new BattleAudioDirector();
  private battleAudioBridge: BattleAudioBridge | undefined;
  private battleBgmBridge: BattleBgmBridge | undefined;
  private pauseMenu: BattlePauseMenuController | undefined;
  private replayRecorder: ReplayRecorder | undefined;
  private replayOverride: ReplayBattleOverride | null = null;
  private spectatorOverride: SpectatorBattleOverride | null = null;

  constructor() {
    super("battle");
  }

  preload(): void {
  }

  create(data: BattleSceneData = {}): void {
    this.sceneData = data;
    this.resultScheduled = false;
    this.replayRecorder = undefined;
    this.replayOverride = null;
    this.spectatorOverride = null;
    this.rollbackManager.reset({ sceneData: data, debug: this.shouldRecordDebugLog() });
    this.accumulator = 0;
    this.mobileControlsEnabled = shouldEnableMobileBattleControls(this) && !data.replayData && !data.spectatorData;
    if (this.mobileControlsEnabled) {
      this.previousScaleAutoCenter = this.scale.autoCenter;
      this.scale.autoCenter = Phaser.Scale.CENTER_HORIZONTALLY;
    } else {
      this.previousScaleAutoCenter = undefined;
    }
    this.applyBattleLayout(createBattleLayout(), true);
    this.battleAudioBridge = installBattleAudioBridge(this);
    this.battleBgmBridge = installBattleBgmBridge(this);
    BgmCmd.PlayMap(data.mapId ?? data.battleConfig?.mapId);
    this.input.setDefaultCursor(data.replayData || data.spectatorData ? "auto" : "none");
    this.input.mouse?.disableContextMenu();
    this.keybinds = createBattleKeybinds(this);
    this.keys = this.keybinds.keys;

    // --- Replay playback mode ---
    if (data.replayData) {
      this.replayOverride = new ReplayBattleOverride(this, data, {
        keys: this.keys,
        bgmBridge: this.battleBgmBridge,
      });
      ConsoleCmd.uninstall(this);
      this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.shutdownBattleScene());
      return;
    }

    if (data.spectatorData) {
      this.spectatorOverride = new SpectatorBattleOverride(this, data, {
        keys: this.keys,
        bgmBridge: this.battleBgmBridge,
      });
      ConsoleCmd.uninstall(this);
      this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.shutdownBattleScene());
      return;
    }

    // --- Normal battle mode ---
    this.pauseMenu = this.isPausableLocalMode()
      ? new BattlePauseMenuController(this, {
        restartEnabled: data.mode !== "training",
        canOpen: () => !this.resultScheduled,
        onPauseOpened: () => {
          this.accumulator = 0;
          this.battleBgmBridge?.pause();
        },
        onResumed: () => this.battleBgmBridge?.resume(),
        onRestart: () => this.restartLocalBattle(),
        onMainMenu: () => this.returnToMainMenu(),
      })
      : undefined;
    this.runtime =
      data.runtime ??
      createRaidLogicRuntime({
        mode: data.mode === "ai"
          ? "ai"
          : data.mode === "online" || data.mode === "local"
            ? "online"
            : "training",
        loadouts: data.loadouts,
        mapId: data.mapId ?? data.battleConfig?.mapId,
        playerInitPoint: data.playerInitPoint,
        opponentInitPoint: data.opponentInitPoint,
        ai: data.ai,
      });
    this.logicReady = data.runtime?.physicsReady === true;
    if (!this.logicReady) {
      this.runtime.initialize().then(() => {
        if (!this.scene.isActive()) return;
        this.logicReady = true;
      });
    }
    if (data.mode === "online" || data.mode === "local") {
      this.view = new BattleView(this, "online", data.mapId ?? data.battleConfig?.mapId);
    } else {
      this.view = new BattleView(this, data.mode ?? "training", data.mapId ?? data.battleConfig?.mapId);
    }
    this.lastInput = createBattleInput(this, this.keys, this.mobileControls);
    this.autoReloadObservedShotsFired = this.localFighterState().shotsFired;
    this.recordDebugFrame();
    this.setupNetworkBattle(data);
    ConsoleCmd.install(this);
    if (data.debug) {
      this.setDebugPhysicsEnabled(true);
    }
    this.syncRollbackManagerState();
    this.fastForwardFromBattleZero(data);

    // --- Replay recording setup (not in training mode) ---
    if (data.mode !== "training" && !this.sceneData.story) {
      this.replayRecorder = new ReplayRecorder();
      this.replayRecorder.startBattle({
        playerName: data.playerName ?? "Player",
        opponentName: data.opponentName ?? "Opponent",
        mapId: data.mapId ?? data.battleConfig?.mapId ?? "hakurei_shrine",
        playerInitPoint: data.playerInitPoint,
        opponentInitPoint: data.opponentInitPoint,
      });
    } else if (data.mode !== "training" && this.sceneData.story) {
      // Story mode: use the global singleton to accumulate across battles
      this.replayRecorder = globalReplayRecorder;
      this.replayRecorder.startBattle({
        playerName: data.playerName ?? "Player",
        opponentName: data.opponentName ?? "Opponent",
        mapId: data.mapId ?? data.battleConfig?.mapId ?? "hakurei_shrine",
        playerInitPoint: data.playerInitPoint,
        opponentInitPoint: data.opponentInitPoint,
        stageIndex: this.sceneData.story.stageIndex,
        stageTitle: this.sceneData.story.story.stages[this.sceneData.story.stageIndex]?.title,
        loadouts: data.loadouts,
      });
    }

    this.scale.on(
      Phaser.Scale.Events.RESIZE,
      this.scheduleBattleLayoutRefresh,
      this,
    );
    this.scale.on(
      Phaser.Scale.Events.ORIENTATION_CHANGE,
      this.scheduleBattleLayoutRefresh,
      this,
    );
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () =>
      this.shutdownBattleScene(),
    );
  }

  update(_: number, delta: number): void {
    // --- Replay playback mode ---
    if (this.replayOverride) {
      this.replayOverride.update(delta);
      return;
    }

    if (this.spectatorOverride) {
      this.spectatorOverride.update(delta);
      return;
    }

    if (this.pauseMenu?.isPaused()) {
      this.pauseMenu.update(delta);
      return;
    }

    // --- Normal battle mode ---
    this.accumulator += delta;
    while (this.accumulator >= FIXED_STEP_MS) {
      if (!this.debugInputLocked) {
        this.lastInput = createBattleInput(
          this,
          this.keys,
          this.mobileControls,
          {
            fighter: this.localFighterState(),
            previousShotsFired: this.autoReloadObservedShotsFired,
          },
        ) satisfies BattleInputState & {
          readonly pointerX: number;
          readonly pointerY: number;
        };
        if ((this.sceneData.mode === "online" || this.sceneData.mode === "local") && this.logicReady) {
          this.combatSync?.step(this.lastInput);
        } else if (
          this.runtime.gameOver &&
          Phaser.Input.Keyboard.JustDown(this.keys.enter)
        ) {
          this.goToResult();
        } else if (this.logicReady) {
          this.stepRuntimeWithDebugInput(this.lastInput);
        }
        this.updateAutoReloadObservation();

        // Record frame for replay (not in training mode)
        if (this.replayRecorder && this.logicReady && !this.debugInputLocked) {
          const p1Input = this.runtime.lastPlayerInput ?? this.lastInput;
          const p2Input = this.runtime.lastTargetInput ?? this.lastInput;
          this.replayRecorder.recordFrame(this.runtime.frame, p1Input, p2Input);
        }
      }
      this.accumulator -= FIXED_STEP_MS;
    }
    const pointerWorld = getBattlePointerWorld(this, this.mobileControls);
    this.lastInput = {
      ...this.lastInput,
      aimX: Math.trunc(pointerWorld.x),
      aimY: Math.trunc(pointerWorld.y),
      pointerX: pointerWorld.x,
      pointerY: pointerWorld.y,
    };
    this.view.render(
      this.currentOutput.state,
      this.lastInput,
      this.combatSync?.localFighterKey() ?? "Player1",
      this.accumulator / FIXED_STEP_MS,
      this.rollbackVisualFrames > 0 ? 0.7 : 1,
    );
    if (this.rollbackVisualFrames > 0) {
      this.rollbackVisualFrames -= 1;
    }
    if (this.debugPhysicsEnabled) {
      this.renderDebugPhysics();
    }
    if (
      this.sceneData.mode !== "online" &&
      this.sceneData.mode !== "local" &&
      this.runtime.gameOver &&
      !this.resultScheduled
    ) {
      this.time.delayedCall(900, () => this.goToResult());
      this.resultScheduled = true;
    }
  }

  getDebugFrame(): number {
    return this.runtime.frame;
  }

  getRecentDebugHashes(count = 50): DebugHashRow[] {
    return this.rollbackManager.getRecentDebugHashes(count);
  }

  getDebugHash(frame: number): DebugHashRow | null {
    return this.rollbackManager.getDebugHash(frame);
  }

  getDebugLiveHashEnabled(): boolean {
    return this.debugLiveHashEnabled;
  }

  setDebugLiveHashEnabled(enabled: boolean): void {
    this.debugLiveHashEnabled = enabled;
    this.syncRollbackManagerState();
  }

  rollbackDebugToFrame(frame: number): boolean {
    const snapshot = this.rollbackManager.getSnapshot(frame);
    if (!snapshot) {
      return false;
    }
    this.runtime.deserialize(snapshot);
    this.accumulator = 0;
    this.rollbackManager.pruneAfter(frame);
    this.recordDebugFrame();
    return true;
  }

  runDebugPresetScript(): DebugHashRow[] | null {
    if (!this.rollbackDebugToFrame(PRESET_SCRIPT_ROLLBACK_FRAME)) {
      return null;
    }

    const rows: DebugHashRow[] = [];
    this.debugInputLocked = true;
    try {
      for (let offset = 0; offset < PRESET_SCRIPT_FRAMES; offset += 1) {
        const input = createPresetScriptInput(offset);
        this.lastInput = {
          ...input,
          pointerX: input.aimX,
          pointerY: input.aimY,
        };
        this.stepRuntimeWithDebugInput(input);
        const row = this.getDebugHash(this.runtime.frame);
        if (row) {
          rows.push({ ...row, action: describePresetScriptAction(offset) });
        }
      }
    } finally {
      this.debugInputLocked = false;
    }
    return rows;
  }

  spawnDebugPoint(size: DebugPointSize): boolean {
    if (this.sceneData.mode === "online" || this.sceneData.mode === "local") {
      return false;
    }
    const pointer = getBattlePointerWorld(this, this.mobileControls);
    this.runtime.debugSpawnPoint({
      rewardSize: pointRewardSizeForDebugSize(size),
      x: pointer.x,
      y: pointer.y,
    });
    this.recordDebugFrame();
    return true;
  }

  setDebugPoint(pointCount: number): boolean {
    if (this.sceneData.mode === "online" || this.sceneData.mode === "local") {
      return false;
    }
    this.runtime.debugSetPoint(pointCount);
    this.recordDebugFrame();
    return true;
  }

  passStoryStage(): boolean {
    if (!this.sceneData.story || this.resultScheduled) {
      return false;
    }
    if (this.shouldRecordDebugLog()) {
      this.printDebugHashBundle(null);
    }
    this.resultScheduled = true;
    this.goToStoryResult(true);
    return true;
  }

  private stepRuntimeWithDebugInput(input: BattleInputState): void {
    this.runtime.step({
      mode: this.sceneData.mode === "ai" ? "ai" : "training",
      player: input,
    });
    this.recordDebugFrame();
  }

  private fastForwardFromBattleZero(data: BattleSceneData): void {
    if (!this.logicReady || data.battleZeroTimeMs === undefined) {
      return;
    }

    const elapsedMs = performance.now() - data.battleZeroTimeMs;
    if (elapsedMs <= 0) {
      return;
    }

    const framesToCatchUp = Math.floor(elapsedMs / FIXED_STEP_MS);
    if (framesToCatchUp <= 0) {
      this.accumulator = elapsedMs;
      return;
    }

    for (let frame = 0; frame < framesToCatchUp; frame += 1) {
      if ((data.mode === "online" || data.mode === "local") && this.combatSync) {
        this.combatSync.step(this.lastInput);
      } else {
        this.stepRuntimeWithDebugInput(this.lastInput);
      }
      this.updateAutoReloadObservation();
    }

    this.accumulator = elapsedMs - framesToCatchUp * FIXED_STEP_MS;
  }

  private localFighterState() {
    const key = this.combatSync?.localFighterKey() ?? "Player1";
    return key === "Player1"
      ? this.runtime.state.player
      : this.runtime.state.target;
  }

  private updateAutoReloadObservation(): void {
    const fighter = this.localFighterState();
    if (
      this.lastInput.reloadPressed ||
      fighter.reloadRemaining > 0 ||
      fighter.ammo > 0 ||
      fighter.shotsFired <= this.autoReloadObservedShotsFired
    ) {
      this.autoReloadObservedShotsFired = fighter.shotsFired;
    }
  }

  private setupNetworkBattle(data: BattleSceneData): void {
    if (data.mode !== "online" && data.mode !== "local") return;
    const isLocalBattle = data.mode === "local";
    this.onlineStatusText = this.add
      .text(24, 24, "", {
        fontFamily: "Arial",
        fontSize: "18px",
        color: "#ffcf6e",
        backgroundColor: "#101820cc",
        padding: { x: 10, y: 6 },
      })
      .setScrollFactor(0)
      .setDepth(Depth.OnlineStatus)
      .setVisible(false);

    const battleConnectionManager = data.mode === "local" ? createLocalBattleConnectionManager() : connectionManager;
    const p2p = data.p2p ?? new P2pConnection(battleConnectionManager, {
      localPlayerId: data.localPlayerId ?? "Player1",
      enabled: data.mode === "local" ? true : data.battleConfig?.p2pEnabled === true,
      stunServer: uiSettings.stunServer,
      onStatus: () => undefined,
      onMessage: () => undefined,
    });

    p2p.setStatusHandler((status) => {
      if (status === "connecting") {
        this.onlineStatusText?.setText(isLocalBattle ? t("battle.p2p_attempt_local") : t("battle.p2p_attempt_online")).setVisible(true);
      } else if (status === "connected") {
        this.onlineStatusText?.setText(isLocalBattle ? t("battle.p2p_connected_local") : t("battle.p2p_connected_online")).setVisible(true);
        this.time.delayedCall(700, () => this.onlineStatusText?.setVisible(false));
      } else if (status === "failed") {
        this.onlineStatusText?.setText(isLocalBattle ? t("battle.p2p_failed_local") : t("battle.p2p_failed_online")).setVisible(true);
        this.time.delayedCall(1100, () => this.onlineStatusText?.setVisible(false));
      }
    });
    p2p.setMessageHandler((message) => this.combatSync?.receivePeerMessage(message));

    this.combatSync = new CombatSyncManager(this.runtime, battleConnectionManager, {
      sceneData: data,
      p2p,
      callbacks: {
        recordStepInputs: (record) => {
          this.rollbackManager.recordStepInputs(record);
          this.forwardSpectatorInputs(record);
        },
        recordConfirmedInputs: (record) => this.rollbackManager.recordConfirmedInputs(record),
        recordFrame: (aimConsumed) => this.recordDebugFrame(aimConsumed),
        getRollbackRecord: (frame) => this.rollbackManager.getRollbackRecord(frame),
        pruneRollbackHistoryAfter: (frame) =>
          this.rollbackManager.pruneAfter(frame),
        pruneRollbackHistoryBefore: (frame) =>
          this.rollbackManager.pruneBefore(frame),
        onRollback: () => {
          // Don't snap accumulator — keep the current render blend so
          // the visual position interpolates smoothly through rolls.
          // A small visual-only catch-up (rollbackVisualFrames) tells
          // the render path to use ~0.7 blend instead of 1, giving a
          // subtle 2-frame ease toward corrected positions.
          this.rollbackVisualFrames = 2;
        },
        setStatusText: (text) =>
          this.onlineStatusText?.setText(text).setVisible(true),
        hideStatusText: () => this.onlineStatusText?.setVisible(false),
        delay: (ms, callback) => {
          this.time.delayedCall(ms, callback);
        },
        finishBattle: (winnerPlayerId, serverConfirmedFrame) =>
          this.goToOnlineResult(winnerPlayerId, serverConfirmedFrame),
      },
    });
    p2p.start();
  }

  private forwardSpectatorInputs(record: {
    readonly frame: number;
    readonly player: BattleInputState;
    readonly target: BattleInputState;
  }): void {
    if ((this.sceneData.localPlayerId ?? "Player1") !== "Player1") return;
    const shouldForwardOnline = this.sceneData.mode === "online";
    const shouldForwardLocal = this.sceneData.mode === "local" && this.sceneData.spectatorForward !== undefined;
    if (!shouldForwardOnline && !shouldForwardLocal) return;
    const playerMessage = {
      type: "spectator_input_frame",
      playerId: "Player1",
      frame: record.frame,
      ackFrame: record.frame,
      ...record.player,
    } as const;
    const targetMessage = {
      type: "spectator_input_frame",
      playerId: "Player2",
      frame: record.frame,
      ackFrame: record.frame,
      ...record.target,
    } as const;
    if (this.sceneData.mode === "online") {
      connectionManager.send(playerMessage);
      connectionManager.send(targetMessage);
      return;
    }
    this.sceneData.spectatorForward?.({ ...playerMessage, type: "input_frame" });
    this.sceneData.spectatorForward?.({ ...targetMessage, type: "input_frame" });
  }

  private shutdownBattleScene(): void {
    this.scale.off(
      Phaser.Scale.Events.RESIZE,
      this.scheduleBattleLayoutRefresh,
      this,
    );
    this.scale.off(
      Phaser.Scale.Events.ORIENTATION_CHANGE,
      this.scheduleBattleLayoutRefresh,
      this,
    );
    this.battleAudioBridge?.dispose();
    this.battleAudioBridge = undefined;
    this.battleBgmBridge?.dispose();
    this.battleBgmBridge = undefined;
    this.pauseMenu?.destroy();
    this.pauseMenu = undefined;
    this.pendingLayoutRefresh?.remove(false);
    this.pendingLayoutRefresh = undefined;
    if (this.previousScaleAutoCenter !== undefined) {
      this.scale.autoCenter = this.previousScaleAutoCenter;
      this.previousScaleAutoCenter = undefined;
    }
    this.mobileControls?.destroy();
    this.mobileControls = undefined;
    this.scale.setGameSize(GAME_WIDTH, GAME_HEIGHT);
    this.cameras.main?.setSize(GAME_WIDTH, GAME_HEIGHT);
    this.cameras.main?.setScroll(0, 0);
    this.input?.setDefaultCursor("auto");
    this.keybinds?.destroy();
    ConsoleCmd.uninstall(this);
    if (this.sceneData.mode === "online" || this.sceneData.mode === "local") {
      this.combatSync?.destroy();
    }
    this.combatSync = undefined;
  }

  private scheduleBattleLayoutRefresh(): void {
    if (this.applyingBattleLayout || !this.scene.isActive()) {
      return;
    }
    this.pendingLayoutRefresh?.remove(false);
    this.pendingLayoutRefresh = this.time.delayedCall(80, () => {
      this.pendingLayoutRefresh = undefined;
      this.applyBattleLayout(createBattleLayout());
    });
  }

  private applyBattleLayout(layout: BattleLayout, force = false): void {
    if (!force && sameBattleLayout(this.battleLayout, layout)) {
      return;
    }
    this.battleLayout = layout;
    this.applyingBattleLayout = true;
    try {
      this.scale.setGameSize(layout.width, layout.height);
      this.cameras.main.setSize(layout.width, layout.height);
      this.cameras.main.setScroll(-layout.arenaInsetX, -layout.arenaInsetY);
    } finally {
      this.applyingBattleLayout = false;
    }
    this.mobileControls?.destroy();
    this.mobileControls = this.mobileControlsEnabled
      ? new BattleMobileControls(this, layout)
      : undefined;
  }

  private goToOnlineResult(
    winnerPlayerId: PlayerId,
    serverConfirmedFrame?: number,
  ): void {
    if (this.resultScheduled) return;
    this.resultScheduled = true;
    this.replayRecorder?.endBattle();
    if (this.shouldRecordDebugLog()) {
      this.printDebugHashBundle(winnerPlayerId, serverConfirmedFrame);
    }
    this.scene.start("result", this.createResultData(winnerPlayerId));
  }

  private isPausableLocalMode(): boolean {
    return (
      this.sceneData.story !== undefined ||
      this.sceneData.mode === "ai" ||
      this.sceneData.mode === "training"
    );
  }

  private returnToMainMenu(): void {
    this.scene.start("home");
  }

  private restartLocalBattle(): void {
    if (this.sceneData.story) {
      this.scene.start("story-progress", {
        state: this.sceneData.story.state,
      } satisfies StoryProgressData);
      return;
    }
    if (this.sceneData.mode === "training") {
      return;
    }
    this.scene.start("loading", {
      ...this.sceneData,
      mode: this.sceneData.mode ?? "ai",
      runtime: undefined,
      p2p: undefined,
      battleZeroTimeMs: undefined,
    } satisfies BattleSceneData);
  }

  private recordDebugFrame(aimConsumed = false): void {
    this.syncRollbackManagerState();
    const outputs = this.runtime.outputQueue.drainAll();
    for (const output of outputs) {
      this.currentOutput = output;
      this.rollbackManager.recordRollbackSnapshot(output.frame, output.snapshot);
      this.audioDirector.sync(output.state, {
        eventTypes: output.events.map((event) => event.type),
      });
      const logRecord = this.rollbackManager.recordFrame(output, {
        localConfirmedFrame:
          this.combatSync?.getConfirmedFrame() ?? output.frame,
        isAimConsuming: aimConsumed,
      });
      if (this.debugLiveHashEnabled) {
        console.log(`${output.frame} - ${output.hashHex}`, {
          events: logRecord?.events ?? output.events.map((event) => event.type),
          localConfirmedFrame:
            logRecord?.localConfirmedFrame ??
            this.combatSync?.getConfirmedFrame() ??
            output.frame,
          isAimConsuming: logRecord?.isAimConsuming ?? false,
          player1Input: logRecord?.player1Input ?? null,
          player2Input: logRecord?.player2Input ?? null,
        });
      }
    }
    this.rollbackManager.pruneOldHistory(this.runtime.frame);
  }

  private shouldRecordDebugLog(): boolean {
    return Boolean(this.sceneData.debug) || uiSettings.debug || this.debugLiveHashEnabled;
  }

  private syncRollbackManagerState(): void {
    this.rollbackManager.setDebugEnabled(this.shouldRecordDebugLog());
  }

  private goToResult(): void {
    if (!this.runtime.gameOver) {
      return;
    }
    this.replayRecorder?.endBattle();
    if (this.shouldRecordDebugLog()) {
      this.printDebugHashBundle(null);
    }
    if (this.sceneData.story) {
      this.goToStoryResult();
      return;
    }
    this.scene.start("result", this.createResultData(null));
  }

  private goToStoryResult(forceWon?: boolean): void {
    const story = this.sceneData.story;
    if (!story) {
      return;
    }
    const player = this.currentOutput.state.player;
    const target = this.currentOutput.state.target;
    const won = forceWon ?? target.deaths > player.deaths;
    const nextState = advanceStoryAfterBattle(story.state, {
      lives: player.lives,
      bombs: player.bombs,
      shots: player.shotsFired,
      bombUses: player.bombUses,
      hitsTaken: player.hitsTaken,
      won,
    });
    if (won) {
      this.scene.start("story-progress", {
        state: nextState,
        fromBattle: true,
        clearedStageIndex: story.stageIndex,
      } satisfies StoryProgressData);
      return;
    }
    // Story failed: finalize replay and pass to result scene
    const replay = this.buildStoryReplayFile();
    this.scene.start("story-result", {
      story: story.story,
      state: nextState,
      success: false,
      replay,
    } satisfies StoryResultData);
  }

  private createResultData(winnerPlayerId: PlayerId | null) {
    const localPlayerName = this.sceneData.playerName ?? uiSettings.username ?? "Player";
    const opponentName = this.sceneData.opponentName ?? (this.sceneData.mode === "online" || this.sceneData.mode === "local" ? "Opponent" : "CPU");
    const localFighterKey = this.combatSync?.localFighterKey() ?? "Player1";
    const localFighterState = localFighterKey === "Player1" ? this.currentOutput.state.player : this.currentOutput.state.target;
    const opponentFighterState = localFighterKey === "Player1" ? this.currentOutput.state.target : this.currentOutput.state.player;
    const debugHashes = this.getFinalDebugHashes();
    const replay = this.buildNormalReplayFile();

    return {
      winnerName: resolveResultWinnerName({
        winnerPlayerId,
        localPlayerId: this.combatSync?.localPlayerId ?? this.sceneData.localPlayerId ?? null,
        localPlayerName,
        opponentName,
        playerDeaths: this.currentOutput.state.player.deaths,
        targetDeaths: this.currentOutput.state.target.deaths,
      }),
      durationSeconds: this.currentOutput.state.stats.elapsedTicks / 60,
      players: [
        createResultPlayerSummary(localPlayerName, localFighterState),
        createResultPlayerSummary(opponentName, opponentFighterState),
      ] as const,
      returnScene: this.sceneData.returnScene ?? "battle-start",
      debugHashes,
      replay,
    };
  }

  private buildNormalReplayFile(): ReplayFile | undefined {
    if (!this.replayRecorder || !this.sceneData.loadouts) return undefined;
    return this.replayRecorder.finalize({
      title: `${this.sceneData.playerName ?? "Player"} vs ${this.sceneData.opponentName ?? "Opponent"}`,
      mode: (this.sceneData.mode === "ai" || this.sceneData.mode === "training") ? "ai" : (this.sceneData.mode === "online" || this.sceneData.mode === "local" ? "online" : "ai"),
      player1Id: this.sceneData.playerName ?? "Player",
      player2Id: this.sceneData.opponentName ?? "Opponent",
      finalGlobalInputHash: this.getFinalDebugHashes()?.finalGlobalInputHash ?? null,
      loadouts: this.sceneData.loadouts,
    });
  }

  private buildStoryReplayFile(): ReplayFile | undefined {
    if (!this.replayRecorder || !this.sceneData.story) return undefined;
    const storyCtx = this.sceneData.story;
    const stage = storyCtx.story.stages[storyCtx.stageIndex];
    const fallback: BattleLoadouts = { player: { primaryCharacterId: "reimu", alternateCharacterId: "marisa" }, target: { primaryCharacterId: "sakuya", alternateCharacterId: "cirno" } };
    return this.replayRecorder.finalize({
      title: `${storyCtx.story.title} - ${stage?.title ?? "Stage"}`,
      mode: "story",
      difficulty: storyCtx.state.difficulty,
      player1Id: this.sceneData.playerName ?? uiSettings.username ?? "Player",
      player2Id: this.sceneData.opponentName ?? "CPU",
      finalGlobalInputHash: this.getFinalDebugHashes()?.finalGlobalInputHash ?? null,
      loadouts: this.sceneData.loadouts ?? fallback,
    });
  }

  /** Toggle debug overlay that visualises Rapier collision bodies. */
  setDebugPhysicsEnabled(enabled: boolean): void {
    this.debugPhysicsEnabled = enabled;
    this.view.setDebugPhysics(enabled);
    if (enabled && this.runtime.physicsReady) {
      this.renderDebugPhysics();
    }
  }

  isDebugPhysicsEnabled(): boolean {
    return this.debugPhysicsEnabled;
  }

  private renderDebugPhysics(): void {
    if (!this.runtime.physicsReady) return;
    this.view.renderDebugBodies(this.runtime.readDebugBodies());
  }

  private printDebugHashBundle(
    winnerPlayerId: PlayerId | null,
    serverConfirmedFrame = this.runtime.frame,
  ): void {
    const bundle = this.getDebugHashBundle(serverConfirmedFrame);
    if (!bundle) {
      return;
    }

    const label = `FXTZ Debug Hash Bundle (mode=${this.sceneData.mode ?? "offline"
      }, winner=${winnerPlayerId ?? "local"}, runtimeFrame=${this.runtime.frame}, localConfirmedFrame=${bundle.localConfirmedFrame}, serverConfirmedFrame=${bundle.serverConfirmedFrame}, authoritativeFrame=${bundle.authoritativeFrame}, sampledUpTo=${bundle.sampledUpTo}, cachedRows=${bundle.rows.length})`;

    console.group(label);
    console.log(
      `finalGlobalHash(BLAKE3)\t${bundle.finalGlobalHash ?? "<incomplete>"}`,
    );
    console.log(
      `finalGlobalInputHash(BLAKE3)\t${bundle.finalGlobalInputHash ?? "<incomplete>"}`,
    );
    console.log(
      `sampledConfirmedFrames\t0-${bundle.sampledUpTo} (${bundle.sampledCount})`,
    );
    if (!bundle.sampled) {
      console.warn(
        `Unable to sample all frames through ${bundle.authoritativeFrame}; sampled up to ${bundle.sampledUpTo}.`,
      );
    }
    if (this.debugLiveHashEnabled) {
      const comps = this.runtime.hashComponentsDebug();
      console.log(`componentHashes\t${JSON.stringify(comps)}`);
    }

    for (const row of bundle.rows) {
      console.log(`${row.frame}\t${row.hash}\t${row.inputHash}`);
    }
    console.groupEnd();
    this.rollbackManager.writeDebugLog(bundle, {
      winnerPlayerId,
      localPlayerId:
        this.combatSync?.localPlayerId ?? this.sceneData.localPlayerId ?? null,
      runtimeFrame: this.runtime.frame,
      targetFrame: bundle.targetFrame,
      serverConfirmedFrame: bundle.serverConfirmedFrame,
      authoritativeFrame: bundle.authoritativeFrame,
      localConfirmedFrame: bundle.localConfirmedFrame,
      sampledConfirmedFrames: {
        from: 0,
        to: bundle.sampledUpTo,
        count: bundle.sampledCount,
        complete: bundle.sampled,
      },
    });
  }

  private getFinalDebugHashes(serverConfirmedFrame = this.runtime.frame) {
    const bundle = this.getDebugHashBundle(serverConfirmedFrame);
    return bundle
      ? {
          finalGlobalHash: bundle.finalGlobalHash,
          finalGlobalInputHash: bundle.finalGlobalInputHash,
        }
      : undefined;
  }

  private getDebugHashBundle(
    serverConfirmedFrame = this.runtime.frame,
  ): BattleHashBundle | null {
    this.syncRollbackManagerState();
    const localConfirmedFrame =
      this.combatSync?.getConfirmedFrame() ?? serverConfirmedFrame;
    const targetFrame =
      this.sceneData.mode === "online" || this.sceneData.mode === "local"
        ? serverConfirmedFrame
        : localConfirmedFrame;
    const authoritativeFrame =
      this.sceneData.mode === "online" || this.sceneData.mode === "local"
        ? Math.min(targetFrame, localConfirmedFrame, serverConfirmedFrame)
        : targetFrame;
    return this.rollbackManager.getBundle({
      localConfirmedFrame,
      serverConfirmedFrame,
      targetFrame,
      authoritativeFrame,
    });
  }

  saveDebugLog(targetFrame = this.runtime.frame): string | null {
    if (!this.shouldRecordDebugLog()) {
      return null;
    }
    this.syncRollbackManagerState();
    const localConfirmedFrame =
      this.combatSync?.getConfirmedFrame() ?? targetFrame;
    const authoritativeFrame =
      this.sceneData.mode === "online" || this.sceneData.mode === "local"
        ? Math.min(targetFrame, localConfirmedFrame)
        : targetFrame;
    const bundle = this.rollbackManager.getBundle({
      localConfirmedFrame,
      serverConfirmedFrame: targetFrame,
      targetFrame,
      authoritativeFrame,
    });
    if (!bundle) {
      return null;
    }
    return this.rollbackManager.writeDebugLog(bundle, {
      winnerPlayerId: null,
      localPlayerId:
        this.combatSync?.localPlayerId ?? this.sceneData.localPlayerId ?? null,
      runtimeFrame: this.runtime.frame,
      targetFrame,
      serverConfirmedFrame: null,
      authoritativeFrame,
      localConfirmedFrame,
      sampledConfirmedFrames: {
        from: 0,
        to: bundle.sampledUpTo,
        count: bundle.sampledCount,
        complete: bundle.sampled,
      },
    });
  }
}

function createLocalBattleConnectionManager(): typeof connectionManager {
  return {
    send: () => undefined,
    setMessageHandler: () => undefined,
  } as unknown as typeof connectionManager;
}

function createResultPlayerSummary(name: string, fighterState: { shotsFired: number; bombUses: number; hitsTaken: number; }) {
  return {
    name,
    shots: fighterState.shotsFired,
    bombUses: fighterState.bombUses,
    hitsTaken: fighterState.hitsTaken,
  };
}

function createBattleLayout(): BattleLayout {
  const viewport = readViewportSize();
  const viewportAspect =
    viewport.width > 0 && viewport.height > 0
      ? viewport.width / viewport.height
      : ARENA_ASPECT_RATIO;
  const width =
    viewportAspect >= ARENA_ASPECT_RATIO
      ? Math.round(ARENA_HEIGHT_PX * viewportAspect)
      : ARENA_WIDTH_PX;
  const height =
    viewportAspect >= ARENA_ASPECT_RATIO
      ? ARENA_HEIGHT_PX
      : Math.round(ARENA_WIDTH_PX / viewportAspect);
  return {
    width,
    height,
    arenaInsetX: Math.max(0, Math.round((width - ARENA_WIDTH_PX) / 2)),
    arenaInsetY: Math.max(0, Math.round((height - ARENA_HEIGHT_PX) / 2)),
  };
}

function readViewportSize(): {
  readonly width: number;
  readonly height: number;
} {
  const viewport = window.visualViewport;
  return {
    width: Math.max(1, Math.round(viewport?.width ?? window.innerWidth)),
    height: Math.max(1, Math.round(viewport?.height ?? window.innerHeight)),
  };
}

function sameBattleLayout(
  left: BattleLayout | undefined,
  right: BattleLayout,
): boolean {
  return (
    left !== undefined &&
    left.width === right.width &&
    left.height === right.height &&
    left.arenaInsetX === right.arenaInsetX &&
    left.arenaInsetY === right.arenaInsetY
  );
}

function createPresetScriptInput(offset: number): BattleInputState {
  const aimAngle = -0.5 + offset * 0.018;
  return {
    moveX: presetMoveX(offset),
    moveY: presetMoveY(offset),
    aimX: 640 + Math.cos(aimAngle) * 390,
    aimY: 338 + Math.sin(aimAngle) * 250,
    shootPressed: isPresetShootFrame(offset),
    bombPressed: isPresetBombFrame(offset),
    activeCardPressed: offset === 320,
    reloadPressed: isPresetReloadFrame(offset),
    alternateHeld: isPresetAlternateHeld(offset),
    infoHeld: false,
  };
}

function presetMoveX(offset: number): -1 | 0 | 1 {
  if (offset < 36) {
    return 1;
  }
  if (offset < 72) {
    return -1;
  }
  if (offset >= 155 && offset < 260) {
    return offset % 32 < 16 ? 1 : -1;
  }
  if (offset >= 260 && offset < 330) {
    return 1;
  }
  return offset % 48 < 16 ? -1 : offset % 48 < 32 ? 1 : 0;
}

function presetMoveY(offset: number): -1 | 0 | 1 {
  if (offset < 28) {
    return -1;
  }
  if (offset < 64) {
    return 1;
  }
  if (offset >= 155 && offset < 260) {
    return offset % 28 < 14 ? -1 : 1;
  }
  return offset % 42 < 14 ? 1 : offset % 42 < 28 ? -1 : 0;
}

function isPresetShootFrame(offset: number): boolean {
  return [
    4, 10, 18, 35, 78, 90, 118, 146, 166, 174, 182, 205, 238, 274, 330, 360,
    390,
  ].includes(offset);
}

function isPresetReloadFrame(offset: number): boolean {
  return [22, 52, 104, 132, 176, 215, 285, 345].includes(offset);
}

function isPresetBombFrame(offset: number): boolean {
  return [64, 150, 188, 250, 404].includes(offset);
}

function isPresetAlternateHeld(offset: number): boolean {
  return (
    (offset >= 72 && offset < 122) ||
    (offset >= 144 && offset < 248) ||
    (offset >= 255 && offset < 305) ||
    (offset >= 350 && offset < 382)
  );
}

function describePresetScriptAction(offset: number): string {
  const actions: string[] = [];
  if (isPresetAlternateHeld(offset)) {
    actions.push("alternateHeld");
  }
  if (isPresetShootFrame(offset)) {
    actions.push("shoot");
  }
  if (isPresetReloadFrame(offset)) {
    actions.push("reload");
  }
  if (isPresetBombFrame(offset)) {
    actions.push("bomb");
  }
  if (offset === 150) {
    actions.push("marisaBombStart");
  }
  if (
    offset > 150 &&
    offset < 390 &&
    (isPresetAlternateHeld(offset) ||
      isPresetShootFrame(offset) ||
      isPresetReloadFrame(offset) ||
      isPresetBombFrame(offset))
  ) {
    actions.push("duringMarisaBombLock");
  }
  if (offset === 320) {
    actions.push("activeCard");
  }
  if (actions.length === 0) {
    return "move+aim";
  }
  return actions.join("+");
}
