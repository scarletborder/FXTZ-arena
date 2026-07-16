import { FIXED_STEP_MS } from "@repo/constants";
import {
  createRaidLogicRuntime,
  type BattleInputState,
  type BattleOutputFrame,
  type BattleOutputState,
  type RaidLogicRuntime,
} from "@repo/raid-logic";
import type { PlayerId } from "@repo/types";

import type { BattleSceneData } from "../loadout";
import type { CombatConnection } from "../../network/combat";
import { BattleFramePipeline } from "./frame-pipeline";
import {
  BattleNetworkSession,
  type BattleNetworkHost,
} from "./network-session";
import {
  BattleRollbackHistory,
  type BattleRollbackLogger,
  type BattleRollbackLogRecord,
} from "./rollback-history";

export interface BattleSessionOutput {
  isDebugEnabled(): boolean;
  readonly logger: BattleRollbackLogger;
  present(
    output: BattleOutputFrame,
    logRecord: BattleRollbackLogRecord | null,
    confirmedFrame: number,
  ): void;
}

export interface BattleSessionInput {
  isLocked(): boolean;
  create(
    fighter: BattleOutputState["player"],
    previousShotsFired: number,
  ): BattleInputState;
  createTarget(
    fighter: BattleOutputState["target"],
    previousShotsFired: number,
  ): BattleInputState;
}

export interface BattleSessionHost {
  isActive(): boolean;
  recordInputFrame(
    frame: number,
    player: BattleInputState,
    target: BattleInputState,
  ): void;
  shouldFinishBattle(): boolean;
  finishBattle(): void;
  onRollback(): void;
}

export interface BattleSessionOptions {
  readonly sceneData: BattleSceneData;
  readonly connection: CombatConnection;
  readonly networkHost: BattleNetworkHost;
  readonly output: BattleSessionOutput;
  readonly input: BattleSessionInput;
  readonly host: BattleSessionHost;
}

export class BattleSession {
  private readonly runtime: RaidLogicRuntime;
  private readonly framePipeline: BattleFramePipeline;
  private readonly network: BattleNetworkSession;
  private readonly rollbackHistory: BattleRollbackHistory;
  private logicReady = false;
  private currentOutput!: BattleOutputFrame;

  constructor(private readonly options: BattleSessionOptions) {
    const { sceneData } = options;
    this.runtime =
      sceneData.runtime ??
      createRaidLogicRuntime({
        mode:
          sceneData.mode === "ai"
            ? "ai"
            : sceneData.mode === "online" || sceneData.mode === "local"
              ? "online"
              : "training",
        loadouts: sceneData.loadouts,
        mapId: sceneData.mapId ?? sceneData.battleConfig?.mapId,
        battleMode: sceneData.battleMode ?? sceneData.battleConfig?.battleMode,
        seed: sceneData.battleConfig?.seed,
        playerInitPoint: sceneData.playerInitPoint,
        opponentInitPoint: sceneData.opponentInitPoint,
        ai: sceneData.ai,
      });

    this.rollbackHistory = new BattleRollbackHistory({
      sceneData,
      debug: options.output.isDebugEnabled(),
      logger: options.output.logger,
    });

    this.framePipeline = new BattleFramePipeline(this.runtime, {
      fixedStepMs: FIXED_STEP_MS,
      mode: sceneData.mode,
      localSingleDevice: sceneData.localSingleDevice === true,
      isLogicReady: () => this.logicReady,
      isInputLocked: () => options.input.isLocked(),
      createInput: (fighter, previousShotsFired) =>
        options.input.create(fighter, previousShotsFired),
      createTargetInput: (fighter, previousShotsFired) =>
        options.input.createTarget(fighter, previousShotsFired),
      isSyncRunning: () => this.network?.isSyncRunning() ?? false,
      stepSync: (input) => this.network?.step(input),
      recordOutputFrame: () => {
        this.recordOutputFrame();
      },
      recordInputFrame: (frame, player, target) =>
        options.host.recordInputFrame(frame, player, target),
      shouldFinishBattle: () => options.host.shouldFinishBattle(),
      finishBattle: () => options.host.finishBattle(),
    });

    this.logicReady = this.runtime.physicsReady;
    if (!this.logicReady) {
      void this.runtime.initialize().then(() => {
        if (options.host.isActive()) this.logicReady = true;
      });
    }

    this.recordOutputFrame();
    this.network = new BattleNetworkSession({
      sceneData,
      runtime: this.runtime,
      connection: options.connection,
      host: options.networkHost,
      recordStepInputs: (record) => this.rollbackHistory.recordStepInputs(record),
      recordConfirmedInputs: (record) =>
        this.rollbackHistory.recordConfirmedInputs(record),
      recordFrame: (aimConsumed) => this.recordOutputFrame(aimConsumed),
      getRollbackRecord: (frame) => this.rollbackHistory.getRollbackRecord(frame),
      pruneAfter: (frame) => this.rollbackHistory.pruneAfter(frame),
      pruneBefore: (frame) => this.rollbackHistory.pruneBefore(frame),
      onRollback: () => options.host.onRollback(),
    });
  }

  getRuntime(): RaidLogicRuntime {
    return this.runtime;
  }

  getRollbackHistory(): BattleRollbackHistory {
    return this.rollbackHistory;
  }

  getCurrentOutput(): BattleOutputFrame {
    return this.currentOutput;
  }

  getAccumulator(): number {
    return this.framePipeline.getAccumulator();
  }

  getLocalPlayerId(): PlayerId | null {
    return this.network.getLocalPlayerId();
  }

  getConfirmedFrame(): number | undefined {
    return this.network.getConfirmedFrame();
  }

  localFighterKey(): "Player1" | "Player2" {
    return this.network.localFighterKey();
  }

  localFighterState(): BattleOutputState["player"] {
    return this.framePipeline.localFighterState(this.localFighterKey());
  }

  isLogicReady(): boolean {
    return this.logicReady;
  }

  isSyncRunning(): boolean {
    return this.network.isSyncRunning();
  }

  isGameOver(): boolean {
    return this.runtime.gameOver;
  }

  readDebugBodies(): ReturnType<RaidLogicRuntime["readDebugBodies"]> | null {
    return this.runtime.physicsReady ? this.runtime.readDebugBodies() : null;
  }

  update(delta: number): void {
    this.framePipeline.update(delta, this.localFighterKey());
  }

  resetAccumulator(): void {
    this.framePipeline.resetAccumulator();
  }

  stepRuntimeWithInput(
    input: BattleInputState,
    targetInput?: BattleInputState,
  ): void {
    this.framePipeline.stepRuntimeWithInput(input, targetInput);
  }

  fastForward(elapsedMs: number, lastInput: BattleInputState): void {
    this.framePipeline.fastForward(
      elapsedMs,
      this.localFighterKey(),
      lastInput,
    );
  }

  recordOutputFrame(aimConsumed = false): BattleOutputFrame | null {
    this.rollbackHistory.setDebugEnabled(this.options.output.isDebugEnabled());
    let lastOutput: BattleOutputFrame | null = null;
    for (const output of this.runtime.outputQueue.drainAll()) {
      lastOutput = output;
      this.rollbackHistory.recordRollbackSnapshot(output.frame, output.snapshot);
      const confirmedFrame = this.network?.getConfirmedFrame() ?? output.frame;
      const logRecord = this.rollbackHistory.recordFrame(output, {
        localConfirmedFrame: confirmedFrame,
        isAimConsuming: aimConsumed,
      });
      this.options.output.present(output, logRecord, confirmedFrame);
    }
    this.rollbackHistory.pruneOldHistory(this.runtime.frame);
    if (lastOutput) this.currentOutput = lastOutput;
    return lastOutput;
  }

  destroy(): void {
    this.network.destroy();
  }
}
