import Phaser from "phaser";
import type { PlayerId } from "@repo/types";

import { FIXED_STEP_MS } from "./battle/constants";
import { createBattleInput, type BattleKeyMap } from "./battle/input";
import type { BattleSceneData } from "./battle/loadout";
import { BattleModel } from "./battle/model";
import { BattlePhysics } from "./battle/model/physics-adapter";
import type { BattleModelSnapshot } from "./battle/model/snapshot";
import { BattleView } from "./battle/view";
import type { BattleInputState } from "./battle/types";
import ConsoleCmd, { type DebugHashRow } from "./commands/ConsoleCmd";
import { uiSettings } from "./menu/shared";
import { connectionManager } from "./menu/shared";
import { CombatSyncManager } from "./network/combat";

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
  private model!: BattleModel;
  private view!: BattleView;
  private debugInputLocked = false;
  private debugLiveHashEnabled = false;
  private debugPhysicsEnabled = false;
  private resultScheduled = false;
  private sceneData: BattleSceneData = {};
  private readonly debugHistory = new Map<number, DebugFrameRecord>();
  private lastInput!: BattleInputState & {
    readonly pointerX: number;
    readonly pointerY: number;
  };
  private combatSync: CombatSyncManager | undefined;
  private onlineStatusText: Phaser.GameObjects.Text | undefined;
  /** Reference kept for debug rendering access. */
  private battlePhysics: BattlePhysics | undefined;

  constructor() {
    super("battle");
  }

  create(data: BattleSceneData = {}): void {
    this.sceneData = data;
    this.resultScheduled = false;
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
    this.model = new BattleModel(data.loadouts, { endOnTargetDefeat: data.mode === "ai" });
    if (data.mode === "online") {
      this.model = new BattleModel(data.loadouts, { endOnTargetDefeat: true });
    }
    // Start Rapier physics initialisation (fire-and-forget; used once ready).
    this.initBattlePhysics();
    this.view = new BattleView(this);
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
        if (this.sceneData.mode === "online") {
          this.combatSync?.step(this.lastInput);
        } else if (this.model.gameOver && Phaser.Input.Keyboard.JustDown(this.keys.enter)) {
          this.goToResult();
        } else {
          this.stepModelWithDebugInput(this.lastInput);
        }
      }
      this.accumulator -= FIXED_STEP_MS;
    }
    this.lastInput = {
      ...this.lastInput,
      aimX: this.input.activePointer.x,
      aimY: this.input.activePointer.y,
      pointerX: this.input.activePointer.x,
      pointerY: this.input.activePointer.y,
    };
    this.view.render(this.model, this.lastInput, this.combatSync?.localFighterKey() ?? "player", this.accumulator / FIXED_STEP_MS);
    if (this.debugPhysicsEnabled) {
      this.renderDebugPhysics();
    }
    if (this.sceneData.mode !== "online" && this.model.gameOver && !this.resultScheduled) {
      this.time.delayedCall(900, () => this.goToResult());
      this.resultScheduled = true;
    }
  }

  getDebugFrame(): number {
    return this.model.frame;
  }

  getRecentDebugHashes(count = 50): DebugHashRow[] {
    const startFrame = Math.max(0, this.model.frame - count + 1);
    return Array.from(this.debugHistory.values())
      .filter((record) => record.frame >= startFrame && record.frame <= this.model.frame)
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
    this.model.deserialize(record.snapshot);
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
        this.stepModelWithDebugInput(input);
        const row = this.getDebugHash(this.model.frame);
        if (row) {
          rows.push({ ...row, action: describePresetScriptAction(offset) });
        }
      }
    } finally {
      this.debugInputLocked = false;
    }
    return rows;
  }

  private stepModelWithDebugInput(input: BattleInputState): void {
    this.model.step(input);
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

    this.combatSync = new CombatSyncManager(this.model, connectionManager, {
      sceneData: data,
      callbacks: {
        recordFrame: () => this.recordDebugFrame(),
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
        finishBattle: (winnerPlayerId) => this.goToOnlineResult(winnerPlayerId),
      },
    });
  }

  private goToOnlineResult(winnerPlayerId: PlayerId): void {
    if (this.resultScheduled) return;
    this.resultScheduled = true;
    if (uiSettings.debug) {
      this.printDebugHashBundle(winnerPlayerId);
    }
    this.scene.start("result", {
      winnerName: winnerPlayerId === this.combatSync?.localPlayerId
        ? (this.sceneData.playerName ?? "Player")
        : (this.sceneData.opponentName ?? "Opponent"),
      durationSeconds: this.model.stats.elapsedTicks / 60,
      shots: this.model.stats.shots,
      hits: this.model.stats.hits,
      bombUses: this.model.stats.bombUses,
      deaths: this.model.player.deaths + this.model.target.deaths,
      returnScene: this.sceneData.returnScene ?? "battle-start",
    });
  }

  private recordDebugFrame(): void {
    const frame = this.model.frame;
    const hash = this.model.hashHex();
    this.debugHistory.set(frame, {
      frame,
      hash,
      snapshot: this.model.serialize(),
    });
    if (this.debugLiveHashEnabled) {
      console.log(`${frame} - ${hash}`);
    }
    this.pruneOldDebugHistory();
  }

  private pruneDebugHistoryAfter(frame: number): void {
    for (const key of this.debugHistory.keys()) {
      if (key > frame) {
        this.debugHistory.delete(key);
      }
    }
  }

  private pruneDebugHistoryBefore(frame: number): void {
    for (const key of this.debugHistory.keys()) {
      if (key < frame) {
        this.debugHistory.delete(key);
      }
    }
  }

  private pruneOldDebugHistory(): void {
    const minFrame = this.model.frame - DEBUG_HISTORY_LIMIT;
    for (const key of this.debugHistory.keys()) {
      if (key < minFrame) {
        this.debugHistory.delete(key);
      }
    }
  }

  private goToResult(): void {
    if (!this.model.gameOver) {
      return;
    }
    if (uiSettings.debug) {
      this.printDebugHashBundle(null);
    }
    this.scene.start("result", {
      winnerName: this.model.target.lives <= 0 ? (this.sceneData.playerName ?? "Player") : (this.sceneData.opponentName ?? "CPU"),
      durationSeconds: this.model.stats.elapsedTicks / 60,
      shots: this.model.stats.shots,
      hits: this.model.stats.hits,
      bombUses: this.model.stats.bombUses,
      deaths: this.model.player.deaths + this.model.target.deaths,
      returnScene: this.sceneData.returnScene ?? "battle-start",
    });
  }

  /** Start Rapier physics initialisation (non-blocking). */
  private initBattlePhysics(): void {
    this.battlePhysics = new BattlePhysics();
    const physics = this.battlePhysics;
    physics.init().then(() => {
      if (!this.scene.isActive()) return; // scene was destroyed in the meantime
      this.model.setPhysics(physics);
    });
  }

  /** Toggle debug overlay that visualises Rapier collision bodies. */
  setDebugPhysicsEnabled(enabled: boolean): void {
    this.debugPhysicsEnabled = enabled;
    this.view.setDebugPhysics(enabled);
    if (enabled && this.battlePhysics) {
      this.renderDebugPhysics();
    }
  }

  isDebugPhysicsEnabled(): boolean {
    return this.debugPhysicsEnabled;
  }

  private renderDebugPhysics(): void {
    if (!this.battlePhysics?.isReady()) return;
    this.view.renderDebug(this.battlePhysics.readAllBodies());
  }

  private printDebugHashBundle(winnerPlayerId: PlayerId | null): void {
    const confirmedFrame = this.combatSync?.getConfirmedFrame() ?? this.model.frame;

    const rows: DebugHashRow[] = [];
    for (const record of this.debugHistory.values()) {
      if (record.frame >= 0 && record.frame <= confirmedFrame) {
        rows.push({ frame: record.frame, hash: record.hash });
      }
    }
    rows.sort((left, right) => left.frame - right.frame);

    const label = `FXTZ Debug Hash Bundle (mode=${
      this.sceneData.mode ?? "offline"
    }, winner=${winnerPlayerId ?? "local"}, confirmedFrames=0-${confirmedFrame}, totalFrames=${rows.length})`;

    console.group(label);
    for (const row of rows) {
      console.log(`${row.frame}\t${row.hash}`);
    }
    console.groupEnd();
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
