import type { PlayerId, ServerMessage } from "@repo/types";

import type { BattleModel } from "../../battle/model";
import type { BattleInputState } from "../../battle/types";
import type { ConnectionManager } from "../client";
import { CombatInputQueues } from "./queues";
import type { CanonicalFighterKey, CombatSyncManagerOptions } from "./types";

export class CombatSyncManager {
  readonly localPlayerId: PlayerId;
  readonly remotePlayerId: PlayerId;
  readonly queues = new CombatInputQueues();

  private readonly inputs = new Map<PlayerId, Map<number, BattleInputState>>();
  private readonly predictedInputs = new Map<string, BattleInputState>();
  private readonly lastKnownInputs = new Map<PlayerId, BattleInputState>([
    ["player-1", neutralInput()],
    ["player-2", neutralInput()],
  ]);
  private lastReceivedRemoteFrame = 0;
  private lastPeerAckFrame = 0;
  private gameOverVerdictSent = false;
  private finishedByServer = false;
  private paused = false;

  constructor(
    private readonly model: BattleModel,
    private readonly connectionManager: ConnectionManager,
    private readonly options: CombatSyncManagerOptions,
  ) {
    this.localPlayerId = options.sceneData.localPlayerId ?? "player-1";
    this.remotePlayerId = this.localPlayerId === "player-1" ? "player-2" : "player-1";
    this.inputs.set("player-1", new Map());
    this.inputs.set("player-2", new Map());
    this.connectionManager.setMessageHandler((msg) => this.handleServerMessage(msg));
  }

  destroy(): void {
    this.connectionManager.setMessageHandler(null);
  }

  localFighterKey(): CanonicalFighterKey {
    return this.localPlayerId === "player-2" ? "target" : "player";
  }

  step(localInput: BattleInputState): void {
    this.consumeReceiveSceneQueue();
    if (this.paused || this.finishedByServer) {
      return;
    }

    if (this.model.gameOver) {
      this.trySendGameOverVerdict();
      return;
    }

    const frame = this.model.frame + 1;
    this.queues.enqueuePending({
      frame,
      input: cloneInput(localInput),
    });
    this.consumeSendSceneQueue();

    this.model.stepVersus(
      this.getInputForFrame("player-1", frame),
      this.getInputForFrame("player-2", frame),
    );
    this.options.callbacks.recordFrame();
    this.pruneOnlineHistory();
    this.trySendGameOverVerdict();
  }

  private handleServerMessage(msg: ServerMessage): void {
    if (msg.type === "input_frame") {
      this.queues.enqueueReceived({
        playerId: msg.playerId,
        frame: msg.frame,
        ackFrame: msg.ackFrame,
        input: cloneInput(msg),
      });
      return;
    }

    if (msg.type === "battle_finished") {
      this.finishedByServer = true;
      this.options.callbacks.setStatusText("双方裁决完成，进入结算…");
      this.options.callbacks.delay(450, () => this.options.callbacks.finishBattle(msg.winnerPlayerId));
      return;
    }

    if (msg.type === "peer_status" && msg.playerId === this.remotePlayerId) {
      if (msg.status === "disconnected") {
        this.paused = true;
        this.options.callbacks.setStatusText("对手断线，等待重连…");
      } else if (msg.status === "reconnected") {
        this.paused = false;
        this.options.callbacks.setStatusText("对手已重连");
        this.options.callbacks.delay(700, () => this.options.callbacks.hideStatusText());
      }
      return;
    }

    if (msg.type === "room_state" && msg.status === "finished" && !this.finishedByServer) {
      this.paused = true;
      this.options.callbacks.setStatusText("对手已退出，战斗结束");
      this.options.callbacks.delay(900, () => this.options.callbacks.finishBattle(this.localPlayerId));
    }
  }

  private consumeReceiveSceneQueue(): void {
    this.queues.drainReceived((item) => {
      this.lastPeerAckFrame = Math.max(this.lastPeerAckFrame, item.ackFrame);
      this.receiveRemoteInput(item.playerId, item.frame, item.input);
    });
  }

  private consumeSendSceneQueue(): void {
    this.queues.drainPending((item) => {
      this.storeInput(this.localPlayerId, item.frame, item.input);
      this.lastKnownInputs.set(this.localPlayerId, item.input);
      this.sendInput(item.frame, item.input);
    });
  }

  private sendInput(frame: number, input: BattleInputState): void {
    this.connectionManager.send({
      type: "input_frame",
      frame,
      ackFrame: this.lastReceivedRemoteFrame,
      ...input,
    });
  }

  private receiveRemoteInput(playerId: PlayerId, frame: number, input: BattleInputState): void {
    if (playerId === this.localPlayerId) return;

    const predicted = this.predictedInputs.get(inputKey(playerId, frame));
    const existing = this.inputs.get(playerId)?.get(frame);
    this.storeInput(playerId, frame, input);
    if (frame >= this.lastReceivedRemoteFrame) {
      this.lastReceivedRemoteFrame = frame;
      this.lastKnownInputs.set(playerId, input);
    }

    if (frame <= this.model.frame && !existing && predicted && !sameInput(predicted, input)) {
      this.rollbackTo(frame);
      if (!this.model.gameOver && !this.paused) {
        this.options.callbacks.hideStatusText();
      }
    }
    this.pruneOnlineHistory();
  }

  private rollbackTo(changedFrame: number): void {
    const restoreFrame = Math.max(0, changedFrame - 1);
    const record = this.options.callbacks.getRollbackRecord(restoreFrame);
    if (!record) return;

    const currentFrame = this.model.frame;
    this.model.deserialize(record.snapshot);
    this.options.callbacks.onRollback();
    this.options.callbacks.pruneRollbackHistoryAfter(restoreFrame);
    this.options.callbacks.recordFrame();

    for (let frame = restoreFrame + 1; frame <= currentFrame; frame += 1) {
      this.model.stepVersus(
        this.getInputForFrame("player-1", frame),
        this.getInputForFrame("player-2", frame),
      );
      this.options.callbacks.recordFrame();
    }
  }

  /** Returns the highest frame number that both peers have acknowledged. */
  getConfirmedFrame(): number {
    return Math.min(this.lastReceivedRemoteFrame, this.lastPeerAckFrame);
  }

  private trySendGameOverVerdict(): void {
    if (this.gameOverVerdictSent || !this.model.gameOver) {
      return;
    }
    if (this.lastReceivedRemoteFrame < this.model.frame) {
      this.options.callbacks.setStatusText("等待对手输入确认终局…");
      return;
    }

    this.gameOverVerdictSent = true;
    this.paused = true;
    const winnerPlayerId = this.winnerPlayerId();
    this.options.callbacks.setStatusText("已提交终局裁决，等待对手确认…");
    this.connectionManager.send({
      type: "game_over",
      frame: this.model.frame,
      ackFrame: this.lastReceivedRemoteFrame,
      winnerPlayerId,
    });
  }

  private winnerPlayerId(): PlayerId {
    return this.model.target.lives <= 0 ? "player-1" : "player-2";
  }

  private storeInput(playerId: PlayerId, frame: number, input: BattleInputState): void {
    this.inputs.get(playerId)?.set(frame, input);
  }

  private getInputForFrame(playerId: PlayerId, frame: number): BattleInputState {
    const actual = this.inputs.get(playerId)?.get(frame);
    if (actual) return actual;
    const predicted = cloneInput(this.lastKnownInputs.get(playerId) ?? neutralInput());
    this.predictedInputs.set(inputKey(playerId, frame), predicted);
    return predicted;
  }

  private pruneOnlineHistory(): void {
    const confirmedFrame = Math.min(this.lastReceivedRemoteFrame, this.lastPeerAckFrame);
    if (confirmedFrame <= 0) return;

    this.options.callbacks.pruneRollbackHistoryBefore(confirmedFrame);
    for (const inputMap of this.inputs.values()) {
      for (const [frame] of inputMap) {
        if (frame < confirmedFrame) {
          inputMap.delete(frame);
        }
      }
    }
    for (const key of this.predictedInputs.keys()) {
      const frame = Number(key.split(":")[1]);
      if (frame < confirmedFrame) {
        this.predictedInputs.delete(key);
      }
    }
  }
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
