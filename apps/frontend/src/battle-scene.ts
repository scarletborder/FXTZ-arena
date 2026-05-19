import Phaser from "phaser";
import type { PlayerId, ServerMessage } from "@repo/types";

import { FIXED_STEP_MS } from "./battle/constants";
import { createBattleInput, type BattleKeyMap } from "./battle/input";
import type { BattleSceneData } from "./battle/loadout";
import { BattleModel } from "./battle/model";
import { BattlePhysics } from "./battle/model/physics-adapter";
import type { BattleModelSnapshot } from "./battle/model/snapshot";
import { BattleView } from "./battle/view";
import type { BattleInputState } from "./battle/types";
import ConsoleCmd, { type DebugHashRow } from "./commands/ConsoleCmd";
import { connectionManager } from "./menu/shared";

interface DebugFrameRecord {
  readonly frame: number;
  readonly hash: string;
  readonly snapshot: BattleModelSnapshot;
}

interface OnlineBattleState {
  readonly localPlayerId: PlayerId;
  readonly remotePlayerId: PlayerId;
  readonly inputs: Map<PlayerId, Map<number, BattleInputState>>;
  readonly predictedInputs: Map<string, BattleInputState>;
  readonly lastKnownInputs: Map<PlayerId, BattleInputState>;
  readonly receive_scene: OnlineReceivedInput[];
  readonly send_scene: OnlinePendingInput[];
  lastReceivedRemoteFrame: number;
  lastPeerAckFrame: number;
  gameOverVerdictSent: boolean;
  finishedByServer: boolean;
  paused: boolean;
  statusText?: Phaser.GameObjects.Text;
}

interface OnlineReceivedInput {
  readonly playerId: PlayerId;
  readonly frame: number;
  readonly ackFrame: number;
  readonly input: BattleInputState;
}

interface OnlinePendingInput {
  readonly frame: number;
  readonly input: BattleInputState;
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
  private onlineState: OnlineBattleState | undefined;
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
        connectionManager.setMessageHandler(null);
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
          this.stepOnlineFrame(this.lastInput);
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
    this.view.render(this.model, this.lastInput, this.localFighterKey(), this.accumulator / FIXED_STEP_MS);
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
    const localPlayerId = data.localPlayerId ?? "player-1";
    const remotePlayerId = localPlayerId === "player-1" ? "player-2" : "player-1";
    const inputs = new Map<PlayerId, Map<number, BattleInputState>>();
    inputs.set("player-1", new Map());
    inputs.set("player-2", new Map());
    this.onlineState = {
      localPlayerId,
      remotePlayerId,
      inputs,
      predictedInputs: new Map(),
      receive_scene: [],
      send_scene: [],
      lastKnownInputs: new Map([
        ["player-1", neutralInput()],
        ["player-2", neutralInput()],
      ]),
      lastReceivedRemoteFrame: 0,
      lastPeerAckFrame: 0,
      gameOverVerdictSent: false,
      finishedByServer: false,
      paused: false,
      statusText: this.add.text(24, 24, "", {
        fontFamily: "Arial",
        fontSize: "18px",
        color: "#ffcf6e",
        backgroundColor: "#101820cc",
        padding: { x: 10, y: 6 },
      }).setDepth(100).setVisible(false),
    };

    connectionManager.setMessageHandler((msg: ServerMessage) => this.onOnlineServerMessage(msg));
  }

  private stepOnlineFrame(localInput: BattleInputState): void {
    const online = this.onlineState;
    if (!online) {
      return;
    }

    this.consumeReceiveSceneQueue();
    if (online.paused || online.finishedByServer) {
      return;
    }

    if (this.model.gameOver) {
      this.trySendOnlineGameOverVerdict();
      return;
    }

    const frame = this.model.frame + 1;
    this.queueSendSceneInput(frame, cloneInput(localInput));
    this.consumeSendSceneQueue();

    this.model.stepVersus(
      this.getInputForFrame("player-1", frame),
      this.getInputForFrame("player-2", frame),
    );
    this.recordDebugFrame();
    this.pruneOnlineHistory();
    this.trySendOnlineGameOverVerdict();
  }

  private queueSendSceneInput(frame: number, input: BattleInputState): void {
    const online = this.onlineState;
    if (!online) return;
    online.send_scene.push({ frame, input });
  }

  private consumeSendSceneQueue(): void {
    const online = this.onlineState;
    if (!online) return;
    while (online.send_scene.length > 0) {
      const item = online.send_scene.shift()!;
      this.storeInput(online.localPlayerId, item.frame, item.input);
      online.lastKnownInputs.set(online.localPlayerId, item.input);
      this.sendOnlineInput(item.frame, item.input);
    }
  }

  private sendOnlineInput(frame: number, input: BattleInputState): void {
    const online = this.onlineState;
    if (!online) return;
    connectionManager.send({
      type: "input_frame",
      frame,
      ackFrame: online.lastReceivedRemoteFrame,
      ...input,
    });
  }

  private onOnlineServerMessage(msg: ServerMessage): void {
    const online = this.onlineState;
    if (!online) return;
    if (msg.type === "input_frame") {
      online.receive_scene.push({
        playerId: msg.playerId,
        frame: msg.frame,
        ackFrame: msg.ackFrame,
        input: cloneInput(msg),
      });
      return;
    }
    if (msg.type === "battle_finished") {
      online.finishedByServer = true;
      online.statusText?.setText("双方裁决完成，进入结算…").setVisible(true);
      this.time.delayedCall(450, () => this.goToOnlineResult(msg.winnerPlayerId));
      return;
    }
    if (msg.type === "peer_status" && msg.playerId === online.remotePlayerId) {
      if (msg.status === "disconnected") {
        online.paused = true;
        online.statusText?.setText("对手断线，等待重连…").setVisible(true);
      } else if (msg.status === "reconnected") {
        online.paused = false;
        online.statusText?.setText("对手已重连").setVisible(true);
        this.time.delayedCall(700, () => online.statusText?.setVisible(false));
      }
      return;
    }
    if (msg.type === "room_state" && msg.status === "finished" && !online.finishedByServer) {
      online.paused = true;
      online.statusText?.setText("对手已退出，战斗结束").setVisible(true);
      this.time.delayedCall(900, () => this.goToOnlineResult(online.localPlayerId));
    }
  }

  private consumeReceiveSceneQueue(): void {
    const online = this.onlineState;
    if (!online) return;
    while (online.receive_scene.length > 0) {
      const item = online.receive_scene.shift()!;
      online.lastPeerAckFrame = Math.max(online.lastPeerAckFrame, item.ackFrame);
      this.receiveRemoteInput(item.playerId, item.frame, item.input);
    }
  }

  private receiveRemoteInput(playerId: PlayerId, frame: number, input: BattleInputState): void {
    const online = this.onlineState;
    if (!online || playerId === online.localPlayerId) return;

    const predicted = online.predictedInputs.get(inputKey(playerId, frame));
    const existing = online.inputs.get(playerId)?.get(frame);
    this.storeInput(playerId, frame, input);
    if (frame >= online.lastReceivedRemoteFrame) {
      online.lastReceivedRemoteFrame = frame;
      online.lastKnownInputs.set(playerId, input);
    }

    if (frame <= this.model.frame && !existing && predicted && !sameInput(predicted, input)) {
      this.rollbackOnlineTo(frame);
      if (!this.model.gameOver && !online.paused) {
        online.statusText?.setVisible(false);
      }
    }
    this.pruneOnlineHistory();
  }

  private rollbackOnlineTo(changedFrame: number): void {
    const restoreFrame = Math.max(0, changedFrame - 1);
    const record = this.debugHistory.get(restoreFrame);
    if (!record) return;

    const currentFrame = this.model.frame;
    this.model.deserialize(record.snapshot);
    this.accumulator = 0;
    this.pruneDebugHistoryAfter(restoreFrame);
    this.recordDebugFrame();

    for (let frame = restoreFrame + 1; frame <= currentFrame; frame += 1) {
      this.model.stepVersus(
        this.getInputForFrame("player-1", frame),
        this.getInputForFrame("player-2", frame),
      );
      this.recordDebugFrame();
    }
  }

  private trySendOnlineGameOverVerdict(): void {
    const online = this.onlineState;
    if (!online || online.gameOverVerdictSent || !this.model.gameOver) {
      return;
    }
    if (online.lastReceivedRemoteFrame < this.model.frame) {
      online.statusText?.setText("等待对手输入确认终局…").setVisible(true);
      return;
    }

    online.gameOverVerdictSent = true;
    online.paused = true;
    const winnerPlayerId = this.onlineWinnerPlayerId();
    online.statusText?.setText("已提交终局裁决，等待对手确认…").setVisible(true);
    connectionManager.send({
      type: "game_over",
      frame: this.model.frame,
      ackFrame: online.lastReceivedRemoteFrame,
      winnerPlayerId,
    });
  }

  private goToOnlineResult(winnerPlayerId: PlayerId): void {
    if (this.resultScheduled) return;
    this.resultScheduled = true;
    this.scene.start("result", {
      winnerName: winnerPlayerId === this.onlineState?.localPlayerId
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

  private onlineWinnerPlayerId(): PlayerId {
    return this.model.target.lives <= 0 ? "player-1" : "player-2";
  }

  private localFighterKey(): "player" | "target" {
    return this.onlineState?.localPlayerId === "player-2" ? "target" : "player";
  }

  private storeInput(playerId: PlayerId, frame: number, input: BattleInputState): void {
    this.onlineState?.inputs.get(playerId)?.set(frame, input);
  }

  private getInputForFrame(playerId: PlayerId, frame: number): BattleInputState {
    const online = this.onlineState;
    if (!online) return neutralInput();
    const actual = online.inputs.get(playerId)?.get(frame);
    if (actual) return actual;
    const predicted = cloneInput(online.lastKnownInputs.get(playerId) ?? neutralInput());
    online.predictedInputs.set(inputKey(playerId, frame), predicted);
    return predicted;
  }

  private pruneOnlineHistory(): void {
    const online = this.onlineState;
    if (!online) return;
    const confirmedFrame = Math.min(online.lastReceivedRemoteFrame, online.lastPeerAckFrame);
    if (confirmedFrame <= 0) return;
    for (const [frame] of this.debugHistory) {
      if (frame < confirmedFrame) {
        this.debugHistory.delete(frame);
      }
    }
    for (const inputMap of online.inputs.values()) {
      for (const [frame] of inputMap) {
        if (frame < confirmedFrame) {
          inputMap.delete(frame);
        }
      }
    }
    for (const key of online.predictedInputs.keys()) {
      const frame = Number(key.split(":")[1]);
      if (frame < confirmedFrame) {
        online.predictedInputs.delete(key);
      }
    }
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
}

function toHashRow(record: DebugFrameRecord): DebugHashRow {
  return {
    frame: record.frame,
    hash: record.hash,
  };
}

function inputKey(playerId: PlayerId, frame: number): string {
  return `${playerId}:${frame}`;
}

function neutralInput(): BattleInputState {
  return {
    moveX: 0,
    moveY: 0,
    aimX: 640,
    aimY: 338,
    shootPressed: false,
    bombPressed: false,
    activeCardPressed: false,
    reloadPressed: false,
    alternateHeld: false,
    infoHeld: false,
  };
}

function cloneInput(input: BattleInputState): BattleInputState {
  return {
    moveX: input.moveX,
    moveY: input.moveY,
    aimX: input.aimX,
    aimY: input.aimY,
    shootPressed: input.shootPressed,
    bombPressed: input.bombPressed,
    activeCardPressed: input.activeCardPressed,
    reloadPressed: input.reloadPressed,
    alternateHeld: input.alternateHeld,
    infoHeld: input.infoHeld,
  };
}

function sameInput(left: BattleInputState, right: BattleInputState): boolean {
  return left.moveX === right.moveX
    && left.moveY === right.moveY
    && left.aimX === right.aimX
    && left.aimY === right.aimY
    && left.shootPressed === right.shootPressed
    && left.bombPressed === right.bombPressed
    && left.activeCardPressed === right.activeCardPressed
    && left.reloadPressed === right.reloadPressed
    && left.alternateHeld === right.alternateHeld
    && left.infoHeld === right.infoHeld;
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
