import type { PlayerId, ServerMessage } from "@repo/types";
import type { ClientMessage, InputFrameMessage } from "@repo/types";
import { t } from "@repo/i18n";
import type { BattleInputState, RaidLogicRuntime } from "@repo/raid-logic";

import { CombatInputQueues } from "./queues";
import type { CanonicalFighterKey, CombatConnection, CombatSyncManagerOptions } from "./types";

export class CombatSyncManager {
  readonly localPlayerId: PlayerId;
  readonly remotePlayerId: PlayerId;
  readonly queues = new CombatInputQueues();

  private readonly inputs = new Map<PlayerId, Map<number, BattleInputState>>();
  private readonly predictedInputs = new Map<string, BattleInputState>();
  private readonly lastKnownInputs = new Map<PlayerId, BattleInputState>([
    ["Player1", neutralInput()],
    ["Player2", neutralInput()],
  ]);
  private readonly forcedShopReadyFrames = new Map<PlayerId, Map<number, number>>([
    ["Player1", new Map()],
    ["Player2", new Map()],
  ]);
  private readonly forcedTransitionReadyFrames = new Map<PlayerId, Set<number>>([
    ["Player1", new Set()],
    ["Player2", new Set()],
  ]);
  private lastReceivedRemoteFrame = 0;
  private lastPeerAckFrame = 0;
  private lastReportedConfirmedInputFrame = 0;
  private gameOverVerdictSent = false;
  private localGameOverVerdict:
    | { readonly frame: number; readonly ackFrame: number; readonly winnerPlayerId: PlayerId }
    | undefined;
  private peerGameOverVerdict:
    | { readonly frame: number; readonly ackFrame: number; readonly winnerPlayerId: PlayerId }
    | undefined;
  private finishedByServer = false;
  /**
   * Frames where the simulation actually consumed aim coordinates
   * (shoot, bomb, active card, or projectile retarget).  For these
   * frames the aim values are material and must be compared during
   * the predicted-vs-actual check; for all other frames the aim
   * comparison is skipped because mouse-wiggles can't alter state.
   */
  private readonly aimConsumingFrames = new Set<number>();
  private paused = false;
  private localBattleFinished = false;
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly runtime: RaidLogicRuntime,
    private readonly connectionManager: CombatConnection,
    private readonly options: CombatSyncManagerOptions,
  ) {
    this.localPlayerId = options.sceneData.localPlayerId ?? "Player1";
    this.remotePlayerId = this.localPlayerId === "Player1" ? "Player2" : "Player1";
    this.inputs.set("Player1", new Map());
    this.inputs.set("Player2", new Map());
    this.connectionManager.setMessageHandler((msg) => this.handleServerMessage(msg));
  }

  destroy(): void {
    this.clearReconnectTimeout();
    this.connectionManager.setMessageHandler(null);
    this.options.p2p?.close();
  }

  localFighterKey(): CanonicalFighterKey {
    return this.localPlayerId === "Player1" ? "Player1" : "Player2";
  }

  step(localInput: BattleInputState): void {
    if (this.paused || this.finishedByServer) {
      // Still drain the receive queue so it doesn't accumulate stale
      // remote inputs that could trigger a delayed flood of rollbacks.
      this.queues.drainReceived(() => undefined);
      return;
    }

    if (this.runtime.gameOver) {
      this.consumeReceiveSceneQueue();
      this.trySendGameOverVerdict();
      return;
    }

    // 1. Enqueue & send local input FIRST so rollback replay (triggered
    //    by consumeReceiveSceneQueue below) always has the latest local
    //    input for the current frame.
    const frame = this.runtime.frame + 1;
    const input = canonicalizeInput(localInput);
    this.queues.enqueuePending({
      frame,
      input,
    });
    this.consumeSendSceneQueue();

    // 2. Drain & apply remote input.  If a rollback fires here the
    //    replayed frames will pull the just-stored local input via
    //    getInputForFrame, so the correction is already "current".
    this.consumeReceiveSceneQueue();

    this.stepRuntimeFrame(frame);
    this.options.callbacks.recordFrame(this.runtime.aimConsumedThisFrame);
    this.maybeScheduleLocalForcedTransitionReady(frame + 1);
    this.maybeScheduleLocalForcedShopReady(frame + 1);
    this.pruneOnlineHistory();
    this.trySendGameOverVerdict();
  }

  private stepRuntimeFrame(frame: number): void {
    const playerInput = this.getInputForFrame("Player1", frame);
    const targetInput = this.getInputForFrame("Player2", frame);
    this.options.callbacks.recordStepInputs?.({
      frame,
      player: cloneInput(playerInput),
      target: cloneInput(targetInput),
    });
    this.runtime.step({
      mode: "online",
      player: playerInput,
      target: targetInput,
      // Player1 (host / lower playerId) has priority over Player2
      hostIsPlayer: true,
    });
    if (this.runtime.aimConsumedThisFrame) {
      this.aimConsumingFrames.add(frame);
    }
  }

  private handleServerMessage(msg: ServerMessage): void {
    if (this.options.p2p?.handleServerMessage(msg)) {
      return;
    }

    if (msg.type === "input_frame") {
      this.receiveInputFrameMessage(msg);
      return;
    }

    if (msg.type === "battle_finished") {
      this.markServerConfirmedFrame(msg.confirmedFrame);
      this.finishedByServer = true;
      this.options.callbacks.setStatusText(t("battle.adjudication_done"));
      this.options.callbacks.delay(450, () => this.options.callbacks.finishBattle(msg.winnerPlayerId, msg.confirmedFrame));
      return;
    }

    if (msg.type === "peer_game_over" && msg.playerId === this.remotePlayerId) {
      this.receivePeerGameOver(msg);
      return;
    }

    if (msg.type === "peer_collaborate_shop_forced_ready" && msg.playerId === this.remotePlayerId) {
      this.receiveForcedShopReady(msg.playerId, msg.frame, msg.shopIndex);
      return;
    }

    if (msg.type === "peer_status" && msg.playerId === this.remotePlayerId) {
      if (msg.status === "disconnected") {
        this.paused = true;
        this.options.callbacks.setStatusText(t("battle.peer_disconnected"));
        this.startReconnectTimeout();
      } else if (msg.status === "reconnected") {
        this.clearReconnectTimeout();
        this.paused = false;
        this.options.callbacks.setStatusText(t("battle.peer_reconnected"));
        this.options.callbacks.delay(700, () => this.options.callbacks.hideStatusText());
      }
      return;
    }

    if (msg.type === "room_state" && msg.status === "finished" && !this.finishedByServer) {
      this.paused = true;
      this.options.callbacks.setStatusText(t("battle.peer_left"));
      this.options.callbacks.delay(900, () => this.options.callbacks.finishBattle(this.localPlayerId));
    }
  }

  private startReconnectTimeout(): void {
    this.clearReconnectTimeout();
    this.reconnectTimeout = setTimeout(() => {
      this.reconnectTimeout = null;
      if (this.finishedByServer || !this.paused) {
        return;
      }
      this.options.callbacks.setStatusText(t("battle.reconnect_timeout"));
      this.options.callbacks.delay(300, () => this.options.callbacks.finishBattle(this.localPlayerId));
    }, 1_000);
  }

  private clearReconnectTimeout(): void {
    if (this.reconnectTimeout !== null) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
  }

  receivePeerMessage(msg: ServerMessage): void {
    if (msg.type === "input_frame") {
      this.receiveInputFrameMessage(msg);
      return;
    }

    if (msg.type === "peer_game_over" && msg.playerId === this.remotePlayerId) {
      this.receivePeerGameOver(msg);
      return;
    }

    if (msg.type === "peer_collaborate_shop_forced_ready" && msg.playerId === this.remotePlayerId) {
      this.receiveForcedShopReady(msg.playerId, msg.frame, msg.shopIndex);
    }
  }

  private receiveForcedShopReady(playerId: PlayerId, frame: number, shopIndex: number): void {
    if (playerId === this.localPlayerId) return;
    if (!Number.isInteger(frame) || frame <= 0 || !Number.isInteger(shopIndex) || shopIndex <= 0) return;

    const frames = this.forcedShopReadyFrames.get(playerId);
    if (!frames || frames.get(frame) === shopIndex) {
      return;
    }
    frames.set(frame, shopIndex);

    if (frame <= this.runtime.frame) {
      this.rollbackTo(frame);
      if (!this.runtime.gameOver && !this.paused) {
        this.options.callbacks.hideStatusText();
      }
    }
  }

  private receivePeerGameOver(msg: Extract<ServerMessage, { type: "peer_game_over" }>): void {
    this.peerGameOverVerdict = {
      frame: msg.frame,
      ackFrame: msg.ackFrame,
      winnerPlayerId: msg.winnerPlayerId,
    };
    this.lastPeerAckFrame = Math.max(this.lastPeerAckFrame, msg.ackFrame);
    this.pruneOnlineHistory();
    if (!this.gameOverVerdictSent) {
      this.options.callbacks.setStatusText(t("battle.peer_adjudicated"));
    }
    this.trySendGameOverVerdict();
  }

  private receiveInputFrameMessage(msg: Extract<ServerMessage, { type: "input_frame" }>): void {
    this.queues.enqueueReceived({
      playerId: msg.playerId,
      frame: msg.frame,
      ackFrame: msg.ackFrame,
      input: canonicalizeInput(msg),
    });

    for (const redundant of msg.UnreliableLinkExtra?.redundantInputs ?? []) {
      this.queues.enqueueReceived({
        playerId: msg.playerId,
        frame: redundant.frame,
        ackFrame: msg.ackFrame,
        input: canonicalizeInput(redundant),
      });
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
      const input = this.applyForcedInputs(this.localPlayerId, item.frame, item.input);
      this.storeInput(this.localPlayerId, item.frame, input);
      this.lastKnownInputs.set(this.localPlayerId, input);
      this.sendInput(item.frame, input);
    });
  }

  private sendInput(frame: number, input: BattleInputState): void {
    const canonicalInput = canonicalizeInput(input);
    const message: InputFrameMessage = {
      type: "input_frame",
      frame,
      ackFrame: this.lastReceivedRemoteFrame,
      ...canonicalInput,
    };
    const redundantInputs = this.options.p2p?.connected ? this.createRedundantInputs(frame) : [];
    if (redundantInputs.length > 0) {
      message.UnreliableLinkExtra = { redundantInputs };
    }

    if (!this.options.p2p?.send(message)) {
      this.connectionManager.send(message);
    }
  }

  private receiveRemoteInput(playerId: PlayerId, frame: number, input: BattleInputState): void {
    if (playerId === this.localPlayerId) return;

    const actualInput = canonicalizeInput(input);
    const predicted = this.predictedInputs.get(inputKey(playerId, frame));
    const existing = this.inputs.get(playerId)?.get(frame);
    this.storeInput(playerId, frame, actualInput);
    this.advanceRemoteContiguousFrame();

    if (frame <= this.runtime.frame) {
      const previous = existing ?? predicted;
      if (!previous) {
        this.pruneOnlineHistory();
        return;
      }
      const aimMismatch = this.aimConsumingFrames.has(frame)
        ? !sameIntentWithAim(previous, actualInput)
        : !sameIntent(previous, actualInput);
      if (aimMismatch) {
        this.rollbackTo(frame);
        if (!this.runtime.gameOver && !this.paused) {
          this.options.callbacks.hideStatusText();
        }
      }
    }
    this.pruneOnlineHistory();
  }

  private rollbackTo(changedFrame: number): void {
    const restoreFrame = Math.max(0, changedFrame - 1);
    const record = this.options.callbacks.getRollbackRecord(restoreFrame);
    if (!record) return;

    const currentFrame = this.runtime.frame;
    this.runtime.deserialize(record.snapshot);
    this.options.callbacks.onRollback();
    this.options.callbacks.pruneRollbackHistoryAfter(restoreFrame);
    // Entries for frames past the restore point are now stale — the
    // replay loop below will re-populate the correct set as it steps.
    for (const f of this.aimConsumingFrames) {
      if (f > restoreFrame) this.aimConsumingFrames.delete(f);
    }
    this.options.callbacks.recordFrame(this.aimConsumingFrames.has(restoreFrame));

    for (let frame = restoreFrame + 1; frame <= currentFrame; frame += 1) {
      this.stepRuntimeFrame(frame);
      this.options.callbacks.recordFrame(this.runtime.aimConsumedThisFrame);
    }
  }

  /** Returns the highest frame number that both peers have acknowledged. */
  getConfirmedFrame(): number {
    return Math.min(this.lastReceivedRemoteFrame, this.lastPeerAckFrame);
  }

  private markServerConfirmedFrame(frame: number): void {
    if (!Number.isInteger(frame) || frame <= 0) {
      return;
    }

    this.lastReceivedRemoteFrame = Math.max(this.lastReceivedRemoteFrame, frame);
    this.lastPeerAckFrame = Math.max(this.lastPeerAckFrame, frame);
    this.pruneOnlineHistory();
  }

  private trySendGameOverVerdict(): void {
    if (this.gameOverVerdictSent) {
      if (this.sceneIsLocalBattle() && this.peerGameOverVerdict && !this.localBattleFinished) {
        this.finishLocalBattle();
      }
      return;
    }

    const localGameOver = this.runtime.gameOver;
    const peerVerdict = this.peerGameOverVerdict;
    if (!localGameOver && !peerVerdict) {
      return;
    }

    const localVerdict = this.createLocalGameOverVerdict(peerVerdict);
    if (!localVerdict) {
      return;
    }
    this.localGameOverVerdict = localVerdict;

    this.gameOverVerdictSent = true;
    this.paused = true;
    this.options.callbacks.setStatusText(t("battle.local_adjudicated"));
    const verdict: ClientMessage = {
      type: "game_over",
      frame: localVerdict.frame,
      ackFrame: localVerdict.ackFrame,
      winnerPlayerId: localVerdict.winnerPlayerId,
    };

    if (this.sceneIsLocalBattle()) {
      this.options.p2p?.send(verdict);
    } else {
      this.connectionManager.send(verdict);
    }

    if (this.sceneIsLocalBattle() && this.peerGameOverVerdict) {
      this.finishLocalBattle();
    }
  }

  private finishLocalBattle(): void {
    if (this.localBattleFinished || !this.peerGameOverVerdict) {
      return;
    }
    const localVerdict = this.localGameOverVerdict ?? this.createLocalGameOverVerdict(this.peerGameOverVerdict);
    if (!localVerdict) {
      return;
    }
    this.localBattleFinished = true;
    const winnerPlayerId = localVerdict.winnerPlayerId;
    const confirmedFrame = Math.min(
      localVerdict.frame,
      localVerdict.ackFrame,
      this.peerGameOverVerdict.frame,
      this.peerGameOverVerdict.ackFrame,
    );
    this.options.callbacks.setStatusText(t("battle.adjudication_done"));
    this.options.callbacks.delay(450, () => this.options.callbacks.finishBattle(winnerPlayerId, confirmedFrame));
  }

  private sceneIsLocalBattle(): boolean {
    return this.options.sceneData.mode === "local";
  }

  private winnerPlayerId(): PlayerId {
    const result = this.runtime.state.result;
    if (result === "versus_player1" || result === "collaborate_victory") {
      return "Player1";
    }
    if (result === "versus_player2" || result === "collaborate_defeat") {
      return "Player2";
    }
    return this.runtime.state.target.lives <= 0 ? "Player1" : "Player2";
  }

  private storeInput(playerId: PlayerId, frame: number, input: BattleInputState): void {
    this.inputs.get(playerId)?.set(frame, canonicalizeInput(input));
  }

  private createLocalGameOverVerdict(
    peerVerdict: { readonly frame: number; readonly ackFrame: number; readonly winnerPlayerId: PlayerId } | undefined,
  ): { readonly frame: number; readonly ackFrame: number; readonly winnerPlayerId: PlayerId } | null {
    if (!this.runtime.gameOver && !peerVerdict) {
      return null;
    }

    const frame = this.runtime.gameOver
      ? this.runtime.frame
      : Math.min(this.runtime.frame, this.lastReceivedRemoteFrame, peerVerdict?.frame ?? this.runtime.frame);
    const ackFrame = Math.min(this.lastReceivedRemoteFrame, frame);
    const winnerPlayerId = this.runtime.gameOver ? this.winnerPlayerId() : peerVerdict!.winnerPlayerId;
    return { frame, ackFrame, winnerPlayerId };
  }

  private createRedundantInputs(currentFrame: number): NonNullable<InputFrameMessage["UnreliableLinkExtra"]>["redundantInputs"] {
    const inputMap = this.inputs.get(this.localPlayerId);
    if (!inputMap) {
      return [];
    }

    const redundant: Array<NonNullable<InputFrameMessage["UnreliableLinkExtra"]>["redundantInputs"][number]> = [];
    for (let frame = currentFrame - 1; frame >= Math.max(1, currentFrame - 4); frame -= 1) {
      const input = inputMap.get(frame);
      if (!input) {
        continue;
      }
      redundant.push({
        frame,
        ...this.applyForcedInputs(this.localPlayerId, frame, cloneInput(input)),
      });
    }
    return redundant;
  }

  private getInputForFrame(playerId: PlayerId, frame: number): BattleInputState {
    const actual = this.inputs.get(playerId)?.get(frame);
    if (actual) return this.applyForcedInputs(playerId, frame, actual);
    const predicted = cloneInput(this.lastKnownInputs.get(playerId) ?? neutralInput());
    this.predictedInputs.set(inputKey(playerId, frame), predicted);
    return this.applyForcedInputs(playerId, frame, predicted);
  }

  private applyForcedInputs(playerId: PlayerId, frame: number, input: BattleInputState): BattleInputState {
    let next = input;
    if (this.forcedTransitionReadyFrames.get(playerId)?.has(frame)) {
      next = {
        ...next,
        transitionReadyPressed: true,
      };
    }
    const shopIndex = this.forcedShopReadyFrames.get(playerId)?.get(frame);
    if (!shopIndex) {
      return next;
    }
    return {
      ...next,
      shopReadyPressed: true,
      shopPurchaseItemId: undefined,
      activeCardSwitchId: undefined,
    };
  }

  private maybeScheduleLocalForcedTransitionReady(frame: number): void {
    const extra = this.runtime.state.collaborateExtra;
    if (!extra || extra.state !== "transition_sync" || extra.transitionType !== "auto") {
      return;
    }
    const localKey = this.localFighterKey();
    const localReady = localKey === "Player1"
      ? extra.player1TransitionReady
      : extra.player2TransitionReady;
    if (localReady) {
      return;
    }
    this.forcedTransitionReadyFrames
      .get(this.localPlayerId)
      ?.add(Math.max(frame, extra.transitionReadyFrame));
  }

  private maybeScheduleLocalForcedShopReady(frame: number): void {
    const extra = this.runtime.state.collaborateExtra;
    const localKey = this.localFighterKey();
    const shop = extra?.shop;
    if (!shop?.open || !shop.revivedByPlayerId[localKey] || shop.readyByPlayerId[localKey]) {
      return;
    }

    const shopIndex = shop.shopIndex;
    this.forcedShopReadyFrames.get(this.localPlayerId)?.set(frame, shopIndex);

    const message: ClientMessage = {
      type: "collaborate_shop_forced_ready",
      frame,
      shopIndex,
    };
    if (!this.options.p2p?.send(message)) {
      this.connectionManager.send(message);
    }
  }

  private pruneOnlineHistory(): void {
    const confirmedFrame = Math.min(this.lastReceivedRemoteFrame, this.lastPeerAckFrame);
    if (confirmedFrame <= 0) return;

    for (let frame = this.lastReportedConfirmedInputFrame + 1; frame <= confirmedFrame; frame += 1) {
      const player = this.inputs.get("Player1")?.get(frame);
      const target = this.inputs.get("Player2")?.get(frame);
      if (!player || !target) {
        break;
      }
      this.options.callbacks.recordConfirmedInputs?.({
        frame,
        confirmedThrough: confirmedFrame,
        player: cloneInput(player),
        target: cloneInput(target),
      });
      this.lastReportedConfirmedInputFrame = frame;
    }
    const safelyConfirmedInputFrame = this.lastReportedConfirmedInputFrame;
    if (safelyConfirmedInputFrame <= 0) {
      return;
    }

    this.options.callbacks.pruneRollbackHistoryBefore(safelyConfirmedInputFrame);
    for (const inputMap of this.inputs.values()) {
      for (const [frame] of inputMap) {
        if (frame < safelyConfirmedInputFrame) {
          inputMap.delete(frame);
        }
      }
    }
    for (const key of this.predictedInputs.keys()) {
      const frame = Number(key.split(":")[1]);
      if (frame < safelyConfirmedInputFrame) {
        this.predictedInputs.delete(key);
      }
    }
    for (const frame of this.aimConsumingFrames) {
      if (frame < safelyConfirmedInputFrame) {
        this.aimConsumingFrames.delete(frame);
      }
    }
    for (const frames of this.forcedShopReadyFrames.values()) {
      for (const [frame] of frames) {
        if (frame < safelyConfirmedInputFrame) {
          frames.delete(frame);
        }
      }
    }
    for (const frames of this.forcedTransitionReadyFrames.values()) {
      for (const frame of frames) {
        if (frame < safelyConfirmedInputFrame) {
          frames.delete(frame);
        }
      }
    }
  }

  private advanceRemoteContiguousFrame(): void {
    const remoteInputs = this.inputs.get(this.remotePlayerId);
    if (!remoteInputs) return;

    while (true) {
      const nextFrame = this.lastReceivedRemoteFrame + 1;
      const nextInput = remoteInputs.get(nextFrame);
      if (!nextInput) {
        break;
      }
      this.lastReceivedRemoteFrame = nextFrame;
      this.lastKnownInputs.set(this.remotePlayerId, nextInput);
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
    transitionReadyPressed: false,
    shopReadyPressed: false,
    shopPurchaseItemId: undefined,
    activeCardSwitchId: undefined,
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
    transitionReadyPressed: input.transitionReadyPressed === true,
    shopReadyPressed: input.shopReadyPressed === true,
    shopPurchaseItemId: input.shopPurchaseItemId,
    activeCardSwitchId: input.activeCardSwitchId,
  };
}

/**
 * Truncate aim coordinates to integers so both peers run logic against
 * the same pixel-grid positions.  Without this, remote inputs that were
 * serialised from a JSON float (e.g. 312.7) and parsed back on the
 * other side can differ from the local prediction by ~0.3px, which —
 * while visually meaningless — was enough to trigger a full rollback.
 */
function canonicalizeInput(input: BattleInputState): BattleInputState {
  return {
    moveX: input.moveX,
    moveY: input.moveY,
    aimX: Math.trunc(input.aimX),
    aimY: Math.trunc(input.aimY),
    shootPressed: input.shootPressed,
    bombPressed: input.bombPressed,
    activeCardPressed: input.activeCardPressed,
    reloadPressed: input.reloadPressed,
    alternateHeld: input.alternateHeld,
    infoHeld: input.infoHeld,
    transitionReadyPressed: input.transitionReadyPressed === true,
    shopReadyPressed: input.shopReadyPressed === true,
    shopPurchaseItemId:
      typeof input.shopPurchaseItemId === "string" &&
      input.shopPurchaseItemId.length > 0
        ? input.shopPurchaseItemId
        : undefined,
    activeCardSwitchId:
      typeof input.activeCardSwitchId === "string" &&
      input.activeCardSwitchId.length > 0
        ? input.activeCardSwitchId
        : undefined,
  };
}

/**
 * Decide whether two inputs represent the same "intent" for rollback purposes.
 *
 * Always-compared fields (discrete / boolean):
 *   moveX, moveY, shootPressed, bombPressed, activeCardPressed,
 *   reloadPressed, alternateHeld, infoHeld, transitionReadyPressed,
 *   shopReadyPressed, shopPurchaseItemId, activeCardSwitchId
 *
 * Conditionally-compared field (aimX, aimY):
 *   The player moves the mouse every single frame, so aim coordinates
 *   change almost continuously.  But aim only *matters* when something
 *   uses it: shooting, bombing, or activating a card.  If neither the
 *   predicted nor the actual frame carries an aim-consuming action,
 *   skip the aim comparison entirely — an aim difference without an
 *   action to consume it cannot change the simulation outcome.
 *
 *   When an aim-consuming action IS present, compare the canonical
 *   integer aim exactly: these coordinates entered the simulation.
 */
function hasAimConsumingAction(input: BattleInputState): boolean {
  return input.shootPressed || input.bombPressed || input.activeCardPressed;
}

/**
 * Like sameIntent but always compares aim coordinates (used for frames
 * that the BattleModel has flagged as aim-consuming via projectile
 * retarget or other automatic mechanisms not visible at the input level).
 */
function sameIntentWithAim(left: BattleInputState, right: BattleInputState): boolean {
  if (left.moveX !== right.moveX) return false;
  if (left.moveY !== right.moveY) return false;
  if (left.shootPressed !== right.shootPressed) return false;
  if (left.bombPressed !== right.bombPressed) return false;
  if (left.activeCardPressed !== right.activeCardPressed) return false;
  if (left.reloadPressed !== right.reloadPressed) return false;
  if (left.alternateHeld !== right.alternateHeld) return false;
  if (left.infoHeld !== right.infoHeld) return false;
  if ((left.transitionReadyPressed === true) !== (right.transitionReadyPressed === true)) return false;
  if ((left.shopReadyPressed === true) !== (right.shopReadyPressed === true)) return false;
  if ((left.shopPurchaseItemId ?? "") !== (right.shopPurchaseItemId ?? "")) return false;
  if ((left.activeCardSwitchId ?? "") !== (right.activeCardSwitchId ?? "")) return false;

  return left.aimX === right.aimX && left.aimY === right.aimY;
}

function sameIntent(left: BattleInputState, right: BattleInputState): boolean {
  // Discrete inputs — always compare.
  if (left.moveX !== right.moveX) return false;
  if (left.moveY !== right.moveY) return false;
  if (left.shootPressed !== right.shootPressed) return false;
  if (left.bombPressed !== right.bombPressed) return false;
  if (left.activeCardPressed !== right.activeCardPressed) return false;
  if (left.reloadPressed !== right.reloadPressed) return false;
  if (left.alternateHeld !== right.alternateHeld) return false;
  if (left.infoHeld !== right.infoHeld) return false;
  if ((left.transitionReadyPressed === true) !== (right.transitionReadyPressed === true)) return false;
  if ((left.shopReadyPressed === true) !== (right.shopReadyPressed === true)) return false;
  if ((left.shopPurchaseItemId ?? "") !== (right.shopPurchaseItemId ?? "")) return false;
  if ((left.activeCardSwitchId ?? "") !== (right.activeCardSwitchId ?? "")) return false;

  // Aim only matters when something consumes it.
  if (!hasAimConsumingAction(left) && !hasAimConsumingAction(right)) {
    return true;
  }

  return left.aimX === right.aimX && left.aimY === right.aimY;
}
