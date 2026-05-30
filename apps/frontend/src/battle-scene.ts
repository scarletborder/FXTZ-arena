import Phaser from "phaser";
import type { PlayerId } from "@repo/types";
import {
  createRaidLogicRuntime,
  type BattleInputState,
  type BattleOutputFrame,
  type BattleModelSnapshot,
  ConfirmedFrameHashAccumulator,
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
import { BattleDebugLogger } from "./battle/logger";
import type { BattleSceneData } from "./battle/loadout";
import {
  BattleMobileControls,
  shouldEnableMobileBattleControls,
} from "./battle/mobile-controls";
import { BattleView } from "./battle/view";
import { Depth } from "./utils/depth";
import ConsoleCmd, { type DebugHashRow } from "./commands/ConsoleCmd";
import { connectionManager } from "./menu/shared";
import { CombatSyncManager } from "./network/combat";
import { P2pConnection } from "./network/p2p";
import { uiSettings } from "./store/settings";

interface DebugFrameRecord {
  readonly frame: number;
  readonly hash: string;
  readonly snapshot: BattleModelSnapshot;
}

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

const DEBUG_HISTORY_LIMIT = 3600;
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
  private debugConfirmedHash = new ConfirmedFrameHashAccumulator();
  private readonly debugHashBacklog = new Map<number, string>();
  private readonly debugHistory = new Map<number, DebugFrameRecord>();
  private readonly debugLogger = new BattleDebugLogger();
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

  constructor() {
    super("battle");
  }

  preload(): void {
  }

  create(data: BattleSceneData = {}): void {
    this.sceneData = data;
    this.resultScheduled = false;
    this.debugConfirmedHash = new ConfirmedFrameHashAccumulator();
    this.debugHashBacklog.clear();
    this.debugHistory.clear();
    this.debugLogger.reset();
    this.accumulator = 0;
    this.mobileControlsEnabled = shouldEnableMobileBattleControls(this);
    if (this.mobileControlsEnabled) {
      this.previousScaleAutoCenter = this.scale.autoCenter;
      this.scale.autoCenter = Phaser.Scale.CENTER_HORIZONTALLY;
    } else {
      this.previousScaleAutoCenter = undefined;
    }
    this.applyBattleLayout(createBattleLayout(), true);
    this.input.setDefaultCursor("none");
    this.input.mouse?.disableContextMenu();
    this.keybinds = createBattleKeybinds(this);
    this.keys = this.keybinds.keys;
    this.runtime =
      data.runtime ??
      createRaidLogicRuntime({
        mode: data.mode ?? "training",
        loadouts: data.loadouts,
        mapId: data.mapId ?? data.battleConfig?.mapId,
      });
    this.logicReady = data.runtime?.physicsReady === true;
    if (!this.logicReady) {
      this.runtime.initialize().then(() => {
        if (!this.scene.isActive()) return;
        this.logicReady = true;
      });
    }
    this.view = new BattleView(this, data.mode ?? "training");
    this.lastInput = createBattleInput(this, this.keys, this.mobileControls);
    this.autoReloadObservedShotsFired = this.localFighterState().shotsFired;
    this.recordDebugFrame();
    this.setupOnlineBattle(data);
    ConsoleCmd.install(this);
    if (data.debug) {
      this.setDebugPhysicsEnabled(true);
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
        if (this.sceneData.mode === "online" && this.logicReady) {
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
      }
      this.accumulator -= FIXED_STEP_MS;
    }
    const pointerWorld = getBattlePointerWorld(this, this.mobileControls);
    this.lastInput = {
      ...this.lastInput,
      aimX: pointerWorld.x,
      aimY: pointerWorld.y,
      pointerX: pointerWorld.x,
      pointerY: pointerWorld.y,
    };
    this.view.render(
      this.currentOutput.state,
      this.lastInput,
      this.combatSync?.localFighterKey() ?? "Player1",
      this.accumulator / FIXED_STEP_MS,
    );
    if (this.debugPhysicsEnabled) {
      this.renderDebugPhysics();
    }
    if (
      this.sceneData.mode !== "online" &&
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
    const startFrame = Math.max(0, this.runtime.frame - count + 1);
    return Array.from(this.debugHistory.values())
      .filter(
        (record) =>
          record.frame >= startFrame && record.frame <= this.runtime.frame,
      )
      .sort((left, right) => left.frame - right.frame)
      .map(toHashRow);
  }

  getDebugHash(frame: number): DebugHashRow | null {
    const record = this.debugHistory.get(frame);
    return record ? toHashRow(record) : null;
  }

  getDebugLiveHashEnabled(): boolean {
    return this.debugLiveHashEnabled;
  }

  setDebugLiveHashEnabled(enabled: boolean): void {
    this.debugLiveHashEnabled = enabled;
  }

  rollbackDebugToFrame(frame: number): boolean {
    const record = this.debugHistory.get(frame);
    if (!record) {
      return false;
    }
    this.runtime.deserialize(record.snapshot);
    this.accumulator = 0;
    this.pruneDebugHistoryAfter(frame);
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
    if (this.sceneData.mode === "online") {
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
    if (this.sceneData.mode === "online") {
      return false;
    }
    this.runtime.debugSetPoint(pointCount);
    this.recordDebugFrame();
    return true;
  }

  private stepRuntimeWithDebugInput(input: BattleInputState): void {
    this.runtime.step({
      mode: this.sceneData.mode === "ai" ? "ai" : "training",
      player: input,
    });
    this.recordDebugFrame();
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

  private setupOnlineBattle(data: BattleSceneData): void {
    if (data.mode !== "online") return;
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

    const p2p = data.p2p ?? new P2pConnection(connectionManager, {
      localPlayerId: data.localPlayerId ?? "Player1",
      enabled: uiSettings.p2pEnabled,
      stunServer: uiSettings.stunServer,
      onStatus: () => undefined,
      onMessage: () => undefined,
    });

    p2p.setStatusHandler((status) => {
      if (status === "connecting") {
        this.onlineStatusText?.setText("正在尝试 P2P 连接…").setVisible(true);
      } else if (status === "connected") {
        this.onlineStatusText?.setText("P2P 已连接").setVisible(true);
        this.time.delayedCall(700, () => this.onlineStatusText?.setVisible(false));
      } else if (status === "failed") {
        this.onlineStatusText?.setText("P2P 不可用，已回落到专用服务器").setVisible(true);
        this.time.delayedCall(1100, () => this.onlineStatusText?.setVisible(false));
      }
    });
    p2p.setMessageHandler((message) => this.combatSync?.receivePeerMessage(message));

    this.combatSync = new CombatSyncManager(this.runtime, connectionManager, {
      sceneData: data,
      p2p,
      callbacks: {
        recordFrame: () => this.recordDebugFrame(),
        recordStepInputs: (record) =>
          this.debugLogger.recordStepInputs(
            record,
            this.shouldRecordDebugLog(),
          ),
        recordConfirmedInputs: (record) =>
          this.debugLogger.recordConfirmedInputs(
            record,
            this.shouldRecordDebugLog(),
          ),
        getRollbackRecord: (frame) => this.debugHistory.get(frame) ?? null,
        pruneRollbackHistoryAfter: (frame) =>
          this.pruneDebugHistoryAfter(frame),
        pruneRollbackHistoryBefore: (frame) =>
          this.pruneDebugHistoryBefore(frame),
        onRollback: () => {
          this.accumulator = 0;
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
    if (this.sceneData.mode === "online") {
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
    if (uiSettings.debug || this.debugLiveHashEnabled) {
      this.printDebugHashBundle(winnerPlayerId, serverConfirmedFrame);
    }
    this.scene.start("result", this.createResultData(winnerPlayerId));
  }

  private recordDebugFrame(): void {
    const outputs = this.runtime.outputQueue.drainAll();
    for (const output of outputs) {
      this.currentOutput = output;
      const logRecord = this.debugLogger.recordFrame(output, {
        enabled: this.shouldRecordDebugLog(),
        localConfirmedFrame:
          this.combatSync?.getConfirmedFrame() ?? output.frame,
      });
      this.debugHistory.set(output.frame, {
        frame: output.frame,
        hash: output.hashHex,
        snapshot: output.snapshot,
      });
      if (output.frame > this.debugConfirmedHash.lastSampledFrame) {
        this.debugHashBacklog.set(output.frame, output.hashHex);
      }
      if (this.debugLiveHashEnabled) {
        console.log(`${output.frame} - ${output.hashHex}`, {
          events: logRecord?.events ?? output.events.map((event) => event.type),
          localConfirmedFrame:
            logRecord?.localConfirmedFrame ??
            this.combatSync?.getConfirmedFrame() ??
            output.frame,
          player1Input: logRecord?.player1Input ?? null,
          player2Input: logRecord?.player2Input ?? null,
        });
      }
    }
    this.pruneOldDebugHistory();
  }

  private shouldRecordDebugLog(): boolean {
    return Boolean(this.sceneData.debug) || uiSettings.debug || this.debugLiveHashEnabled;
  }

  private pruneDebugHistoryAfter(frame: number): void {
    for (const key of this.debugHistory.keys()) {
      if (key > frame) {
        this.debugHistory.delete(key);
      }
    }
    for (const key of this.debugHashBacklog.keys()) {
      if (key > frame) {
        this.debugHashBacklog.delete(key);
      }
    }
    this.debugLogger.pruneAfter(frame);
  }

  private pruneDebugHistoryBefore(frame: number): void {
    this.recordConfirmedDebugHashesThrough(frame);
    for (const key of this.debugHistory.keys()) {
      if (key < frame) {
        this.debugHistory.delete(key);
      }
    }
  }

  private pruneOldDebugHistory(): void {
    const minFrame = this.runtime.frame - DEBUG_HISTORY_LIMIT;
    for (const key of this.debugHistory.keys()) {
      if (key < minFrame) {
        this.debugHistory.delete(key);
      }
    }
  }

  private goToResult(): void {
    if (!this.runtime.gameOver) {
      return;
    }
    if (uiSettings.debug || this.debugLiveHashEnabled) {
      this.printDebugHashBundle(null);
    }
    this.scene.start("result", this.createResultData(null));
  }

  private createResultData(winnerPlayerId: PlayerId | null) {
    const localPlayerName = this.sceneData.playerName ?? uiSettings.username ?? "Player";
    const opponentName = this.sceneData.opponentName ?? (this.sceneData.mode === "online" ? "Opponent" : "CPU");
    const localFighterKey = this.combatSync?.localFighterKey() ?? "Player1";
    const localFighterState = localFighterKey === "Player1" ? this.currentOutput.state.player : this.currentOutput.state.target;
    const opponentFighterState = localFighterKey === "Player1" ? this.currentOutput.state.target : this.currentOutput.state.player;

    return {
      winnerName:
        winnerPlayerId === null
          ? (this.currentOutput.state.target.lives <= 0 ? localPlayerName : opponentName)
          : winnerPlayerId === this.combatSync?.localPlayerId
            ? localPlayerName
            : opponentName,
      durationSeconds: this.currentOutput.state.stats.elapsedTicks / 60,
      players: [
        createResultPlayerSummary(localPlayerName, localFighterState),
        createResultPlayerSummary(opponentName, opponentFighterState),
      ] as const,
      returnScene: this.sceneData.returnScene ?? "battle-start",
    };
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
    this.view.renderDebug(this.runtime.readDebugBodies());
  }

  private printDebugHashBundle(
    winnerPlayerId: PlayerId | null,
    serverConfirmedFrame = this.runtime.frame,
  ): void {
    const localConfirmedFrame =
      this.combatSync?.getConfirmedFrame() ?? serverConfirmedFrame;
    const targetFrame =
      this.sceneData.mode === "online" ? serverConfirmedFrame : localConfirmedFrame;
    const authoritativeFrame =
      this.sceneData.mode === "online"
        ? Math.min(targetFrame, localConfirmedFrame, serverConfirmedFrame)
        : targetFrame;
    const hashComplete =
      this.recordConfirmedDebugHashesThrough(authoritativeFrame) &&
      authoritativeFrame >= targetFrame;

    const rows = this.debugLogger.getConfirmedRows(authoritativeFrame);

    const label = `FXTZ Debug Hash Bundle (mode=${this.sceneData.mode ?? "offline"
      }, winner=${winnerPlayerId ?? "local"}, runtimeFrame=${this.runtime.frame}, localConfirmedFrame=${localConfirmedFrame}, serverConfirmedFrame=${serverConfirmedFrame}, authoritativeFrame=${authoritativeFrame}, cachedRows=${rows.length})`;

    console.group(label);
    console.log(
      `finalGlobalHash(BLAKE3)\t${hashComplete ? this.debugConfirmedHash.digestHex(targetFrame) : "<incomplete>"}`,
    );
    console.log(
      `sampledConfirmedFrames\t0-${this.debugConfirmedHash.lastSampledFrame} (${this.debugConfirmedHash.samples})`,
    );
    if (!hashComplete) {
      console.warn(
        `Unable to sample authoritative frames through ${targetFrame}; local authoritative frame is ${authoritativeFrame}.`,
      );
    }
    for (const row of rows) {
      console.log(`${row.frame}\t${row.hash}`);
    }
    console.groupEnd();
    this.writeDebugHashLogFile({
      winnerPlayerId,
      targetFrame,
      serverConfirmedFrame,
      authoritativeFrame,
      localConfirmedFrame,
      hashComplete,
    });
  }

  private recordConfirmedDebugHashesThrough(frame: number): boolean {
    for (
      let nextFrame = this.debugConfirmedHash.lastSampledFrame + 1;
      nextFrame <= frame;
      nextFrame += 1
    ) {
      const hash =
        this.debugHashBacklog.get(nextFrame) ??
        this.debugHistory.get(nextFrame)?.hash;
      if (!hash) {
        return false;
      }
      this.debugConfirmedHash.addSample({
        frame: nextFrame,
        hashHex: hash,
      });
      this.debugLogger.recordConfirmedFrame({
        enabled: this.shouldRecordDebugLog(),
        frame: nextFrame,
        hash,
        confirmedThrough: frame,
      });
      this.debugHashBacklog.delete(nextFrame);
    }
    return true;
  }

  saveDebugLog(targetFrame = this.runtime.frame): string | null {
    const localConfirmedFrame =
      this.combatSync?.getConfirmedFrame() ?? targetFrame;
    const authoritativeFrame =
      this.sceneData.mode === "online"
        ? Math.min(targetFrame, localConfirmedFrame)
        : targetFrame;
    return this.writeDebugHashLogFile({
      winnerPlayerId: null,
      targetFrame,
      serverConfirmedFrame: null,
      authoritativeFrame,
      localConfirmedFrame,
      hashComplete:
        this.recordConfirmedDebugHashesThrough(authoritativeFrame) &&
        authoritativeFrame >= targetFrame,
    });
  }

  private writeDebugHashLogFile(params: {
    readonly winnerPlayerId: PlayerId | null;
    readonly targetFrame: number;
    readonly serverConfirmedFrame: number | null;
    readonly authoritativeFrame: number;
    readonly localConfirmedFrame: number;
    readonly hashComplete: boolean;
  }): string | null {
    const finalGlobalHash = params.hashComplete
      ? this.debugConfirmedHash.digestHex(params.targetFrame)
      : null;
    return this.debugLogger.writeFile({
      sceneData: this.sceneData,
      winnerPlayerId: params.winnerPlayerId,
      localPlayerId:
        this.combatSync?.localPlayerId ?? this.sceneData.localPlayerId ?? null,
      runtimeFrame: this.runtime.frame,
      targetFrame: params.targetFrame,
      serverConfirmedFrame: params.serverConfirmedFrame,
      authoritativeFrame: params.authoritativeFrame,
      localConfirmedFrame: params.localConfirmedFrame,
      finalGlobalHash,
      sampledConfirmedFrames: {
        from: 0,
        to: this.debugConfirmedHash.lastSampledFrame,
        count: this.debugConfirmedHash.samples,
        complete: params.hashComplete,
      },
    });
  }
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

function toHashRow(record: DebugFrameRecord): DebugHashRow {
  return {
    frame: record.frame,
    hash: record.hash,
  };
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
