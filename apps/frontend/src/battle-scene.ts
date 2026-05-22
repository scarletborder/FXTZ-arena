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

import { FIXED_STEP_MS } from "@repo/constants";
import { createBattleInput, getBattlePointerWorld, type BattleKeyMap } from "./battle/input";
import { BattleDebugLogger } from "./battle/logger";
import type { BattleSceneData } from "./battle/loadout";
import { BattleView } from "./battle/view";
import ConsoleCmd, { type DebugHashRow } from "./commands/ConsoleCmd";
import { connectionManager } from "./menu/shared";
import { CombatSyncManager } from "./network/combat";
import { uiSettings } from "./store/settings";

interface DebugFrameRecord {
  readonly frame: number;
  readonly hash: string;
  readonly snapshot: BattleModelSnapshot;
}

const DEBUG_HISTORY_LIMIT = 3600;
const PRESET_SCRIPT_ROLLBACK_FRAME = 30;
const PRESET_SCRIPT_FRAMES = 420;

export class BattleScene extends Phaser.Scene {
  private accumulator = 0;
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
  private combatSync: CombatSyncManager | undefined;
  private onlineStatusText: Phaser.GameObjects.Text | undefined;

  constructor() {
    super("battle");
  }

  create(data: BattleSceneData = {}): void {
    this.sceneData = data;
    this.resultScheduled = false;
    this.debugConfirmedHash = new ConfirmedFrameHashAccumulator();
    this.debugHashBacklog.clear();
    this.debugHistory.clear();
    this.debugLogger.reset();
    this.accumulator = 0;
    this.input.setDefaultCursor("none");
    this.input.mouse?.disableContextMenu();
    this.keys = this.input.keyboard!.addKeys({
      w: "W",
      a: "A",
      s: "S",
      d: "D",
      shift: Phaser.Input.Keyboard.KeyCodes.SHIFT,
      r: "R",
      tab: Phaser.Input.Keyboard.KeyCodes.TAB,
      enter: Phaser.Input.Keyboard.KeyCodes.ENTER,
      e: "E",
    }) as BattleKeyMap;
    this.runtime = createRaidLogicRuntime({
      mode: data.mode ?? "training",
      loadouts: data.loadouts,
    });
    this.logicReady = false;
    this.runtime.initialize().then(() => {
      if (!this.scene.isActive()) return;
      this.logicReady = true;
    });
    this.view = new BattleView(this, data.mode ?? "training");
    this.lastInput = createBattleInput(this, this.keys);
    this.recordDebugFrame();
    this.setupOnlineBattle(data);
    ConsoleCmd.install(this);
    if (data.debug) {
      this.setDebugPhysicsEnabled(true);
    }
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.input.setDefaultCursor("auto");
      ConsoleCmd.uninstall(this);
      if (this.sceneData.mode === "online") {
        this.combatSync?.destroy();
      }
    });
  }

  update(_: number, delta: number): void {
    this.accumulator += delta;
    while (this.accumulator >= FIXED_STEP_MS) {
      if (!this.debugInputLocked) {
        this.lastInput = createBattleInput(this, this.keys) satisfies BattleInputState & {
          readonly pointerX: number;
          readonly pointerY: number;
        };
        if (this.sceneData.mode === "online" && this.logicReady) {
          this.combatSync?.step(this.lastInput);
        } else if (this.runtime.gameOver && Phaser.Input.Keyboard.JustDown(this.keys.enter)) {
          this.goToResult();
        } else if (this.logicReady) {
          this.stepRuntimeWithDebugInput(this.lastInput);
        }
      }
      this.accumulator -= FIXED_STEP_MS;
    }
    const pointerWorld = getBattlePointerWorld(this);
    this.lastInput = {
      ...this.lastInput,
      aimX: pointerWorld.x,
      aimY: pointerWorld.y,
      pointerX: pointerWorld.x,
      pointerY: pointerWorld.y,
    };
    this.view.render(this.currentOutput.state, this.lastInput, this.combatSync?.localFighterKey() ?? "Player1", this.accumulator / FIXED_STEP_MS);
    if (this.debugPhysicsEnabled) {
      this.renderDebugPhysics();
    }
    if (this.sceneData.mode !== "online" && this.runtime.gameOver && !this.resultScheduled) {
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
      .filter((record) => record.frame >= startFrame && record.frame <= this.runtime.frame)
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
        this.lastInput = { ...input, pointerX: input.aimX, pointerY: input.aimY };
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

  private stepRuntimeWithDebugInput(input: BattleInputState): void {
    this.runtime.step({ mode: this.sceneData.mode === "ai" ? "ai" : "training", player: input });
    this.recordDebugFrame();
  }

  private setupOnlineBattle(data: BattleSceneData): void {
    if (data.mode !== "online") return;
    this.onlineStatusText = this.add.text(24, 24, "", {
      fontFamily: "Arial",
      fontSize: "18px",
      color: "#ffcf6e",
      backgroundColor: "#101820cc",
      padding: { x: 10, y: 6 },
    }).setDepth(100).setVisible(false);

    this.combatSync = new CombatSyncManager(this.runtime, connectionManager, {
      sceneData: data,
      callbacks: {
        recordFrame: () => this.recordDebugFrame(),
        recordStepInputs: (record) => this.debugLogger.recordStepInputs(record, this.shouldRecordDebugLog()),
        getRollbackRecord: (frame) => this.debugHistory.get(frame) ?? null,
        pruneRollbackHistoryAfter: (frame) => this.pruneDebugHistoryAfter(frame),
        pruneRollbackHistoryBefore: (frame) => this.pruneDebugHistoryBefore(frame),
        onRollback: () => {
          this.accumulator = 0;
        },
        setStatusText: (text) => this.onlineStatusText?.setText(text).setVisible(true),
        hideStatusText: () => this.onlineStatusText?.setVisible(false),
        delay: (ms, callback) => {
          this.time.delayedCall(ms, callback);
        },
        finishBattle: (winnerPlayerId, serverConfirmedFrame) => this.goToOnlineResult(winnerPlayerId, serverConfirmedFrame),
      },
    });
  }

  private goToOnlineResult(winnerPlayerId: PlayerId, serverConfirmedFrame?: number): void {
    if (this.resultScheduled) return;
    this.resultScheduled = true;
    if (uiSettings.debug || this.debugLiveHashEnabled) {
      this.printDebugHashBundle(winnerPlayerId, serverConfirmedFrame);
    }
    this.scene.start("result", {
      winnerName: winnerPlayerId === this.combatSync?.localPlayerId
        ? (this.sceneData.playerName ?? "Player")
        : (this.sceneData.opponentName ?? "Opponent"),
      durationSeconds: this.currentOutput.state.stats.elapsedTicks / 60,
      shots: this.currentOutput.state.stats.shots,
      hits: this.currentOutput.state.stats.hits,
      bombUses: this.currentOutput.state.stats.bombUses,
      deaths: this.currentOutput.state.player.deaths + this.currentOutput.state.target.deaths,
      returnScene: this.sceneData.returnScene ?? "battle-start",
    });
  }

  private recordDebugFrame(): void {
    const outputs = this.runtime.outputQueue.drainAll();
    for (const output of outputs) {
      this.currentOutput = output;
      const logRecord = this.debugLogger.recordFrame(output, {
        enabled: this.shouldRecordDebugLog(),
        localConfirmedFrame: this.combatSync?.getConfirmedFrame() ?? output.frame,
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
          localConfirmedFrame: logRecord?.localConfirmedFrame ?? this.combatSync?.getConfirmedFrame() ?? output.frame,
          player1Input: logRecord?.player1Input ?? null,
          player2Input: logRecord?.player2Input ?? null,
        });
      }
    }
    this.pruneOldDebugHistory();
  }

  private shouldRecordDebugLog(): boolean {
    return uiSettings.debug || this.debugLiveHashEnabled;
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
    this.scene.start("result", {
      winnerName: this.currentOutput.state.target.lives <= 0 ? (this.sceneData.playerName ?? "Player") : (this.sceneData.opponentName ?? "CPU"),
      durationSeconds: this.currentOutput.state.stats.elapsedTicks / 60,
      shots: this.currentOutput.state.stats.shots,
      hits: this.currentOutput.state.stats.hits,
      bombUses: this.currentOutput.state.stats.bombUses,
      deaths: this.currentOutput.state.player.deaths + this.currentOutput.state.target.deaths,
      returnScene: this.sceneData.returnScene ?? "battle-start",
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
    this.view.renderDebug(this.runtime.readDebugBodies());
  }

  private printDebugHashBundle(winnerPlayerId: PlayerId | null, serverConfirmedFrame = this.runtime.frame): void {
    const localConfirmedFrame = this.combatSync?.getConfirmedFrame() ?? serverConfirmedFrame;
    const targetFrame = this.sceneData.mode === "online" ? serverConfirmedFrame : localConfirmedFrame;
    const authoritativeFrame = this.sceneData.mode === "online"
      ? Math.min(targetFrame, localConfirmedFrame)
      : targetFrame;
    const hashComplete = this.recordConfirmedDebugHashesThrough(authoritativeFrame) && authoritativeFrame >= targetFrame;

    const rows = this.debugLogger.getConfirmedRows(authoritativeFrame);

    const label = `FXTZ Debug Hash Bundle (mode=${this.sceneData.mode ?? "offline"
      }, winner=${winnerPlayerId ?? "local"}, runtimeFrame=${this.runtime.frame}, localConfirmedFrame=${localConfirmedFrame}, serverConfirmedFrame=${targetFrame}, authoritativeFrame=${authoritativeFrame}, cachedRows=${rows.length})`;

    console.group(label);
    console.log(`finalGlobalHash(BLAKE3)\t${hashComplete ? this.debugConfirmedHash.digestHex(targetFrame) : "<incomplete>"}`);
    console.log(`sampledConfirmedFrames\t0-${this.debugConfirmedHash.lastSampledFrame} (${this.debugConfirmedHash.samples})`);
    if (!hashComplete) {
      console.warn(`Unable to sample authoritative frames through ${targetFrame}; local authoritative frame is ${authoritativeFrame}.`);
    }
    for (const row of rows) {
      console.log(`${row.frame}\t${row.hash}`);
    }
    console.groupEnd();
    this.writeDebugHashLogFile({
      winnerPlayerId,
      targetFrame,
      authoritativeFrame,
      localConfirmedFrame,
      hashComplete,
    });
  }

  private recordConfirmedDebugHashesThrough(frame: number): boolean {
    for (let nextFrame = this.debugConfirmedHash.lastSampledFrame + 1; nextFrame <= frame; nextFrame += 1) {
      const hash = this.debugHashBacklog.get(nextFrame) ?? this.debugHistory.get(nextFrame)?.hash;
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
    const localConfirmedFrame = this.combatSync?.getConfirmedFrame() ?? targetFrame;
    const authoritativeFrame = this.sceneData.mode === "online"
      ? Math.min(targetFrame, localConfirmedFrame)
      : targetFrame;
    return this.writeDebugHashLogFile({
      winnerPlayerId: null,
      targetFrame,
      authoritativeFrame,
      localConfirmedFrame,
      hashComplete: this.recordConfirmedDebugHashesThrough(authoritativeFrame) && authoritativeFrame >= targetFrame,
    });
  }

  private writeDebugHashLogFile(params: {
    readonly winnerPlayerId: PlayerId | null;
    readonly targetFrame: number;
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
      localPlayerId: this.combatSync?.localPlayerId ?? this.sceneData.localPlayerId ?? null,
      runtimeFrame: this.runtime.frame,
      targetFrame: params.targetFrame,
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
    4,
    10,
    18,
    35,
    78,
    90,
    118,
    146,
    166,
    174,
    182,
    205,
    238,
    274,
    330,
    360,
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
  if (offset > 150 && offset < 390 && (isPresetAlternateHeld(offset) || isPresetShootFrame(offset) || isPresetReloadFrame(offset) || isPresetBombFrame(offset))) {
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
