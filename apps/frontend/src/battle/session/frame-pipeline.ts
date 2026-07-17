import type { RaidLogicRuntime } from "@repo/raid-logic";
import type {
  BattleInputState,
  BattleOutputState,
  FighterKey,
} from "@repo/types";

type BattleFrameRuntime = Pick<
  RaidLogicRuntime,
  | "frame"
  | "gameOver"
  | "lastPlayerInput"
  | "lastTargetInput"
  | "state"
  | "step"
>;

export interface BattleFramePipelineOptions {
  readonly fixedStepMs: number;
  readonly mode: "ai" | "training" | "online" | "local" | undefined;
  readonly localSingleDevice: boolean;
  readonly isLogicReady: () => boolean;
  readonly isInputLocked: () => boolean;
  readonly createInput: (
    fighter: BattleOutputState["player"],
    previousShotsFired: number,
  ) => BattleInputState;
  readonly createTargetInput: (
    fighter: BattleOutputState["target"],
    previousShotsFired: number,
  ) => BattleInputState;
  readonly isSyncRunning: () => boolean;
  readonly stepSync: (input: BattleInputState) => void;
  readonly recordOutputFrame: () => void;
  readonly recordInputFrame: (
    frame: number,
    player: BattleInputState,
    target: BattleInputState,
  ) => void;
  readonly shouldFinishBattle: () => boolean;
  readonly finishBattle: () => void;
}

export class BattleFramePipeline {
  private accumulator = 0;
  private autoReloadObservedShotsFired = 0;
  private targetAutoReloadObservedShotsFired = 0;

  constructor(
    private readonly runtime: BattleFrameRuntime,
    private readonly options: BattleFramePipelineOptions,
  ) {}

  getAccumulator(): number {
    return this.accumulator;
  }

  resetAccumulator(): void {
    this.accumulator = 0;
  }

  localFighterState(localFighterKey: FighterKey): BattleOutputState["player"] {
    return localFighterKey === "Player1"
      ? this.runtime.state.player
      : this.runtime.state.target;
  }

  update(delta: number, localFighterKey: FighterKey): void {
    this.accumulator += delta;
    while (this.accumulator >= this.options.fixedStepMs) {
      this.advanceFrame(localFighterKey);
      this.accumulator -= this.options.fixedStepMs;
    }
  }

  stepRuntimeWithInput(
    input: BattleInputState,
    targetInput?: BattleInputState,
  ): void {
    if (this.options.localSingleDevice && targetInput) {
      this.runtime.step({ mode: "online", player: input, target: targetInput });
    } else {
      this.runtime.step({
        mode: this.options.mode === "ai" ? "ai" : "training",
        player: input,
      });
    }
    this.options.recordOutputFrame();
  }

  fastForward(
    elapsedMs: number,
    localFighterKey: FighterKey,
    lastInput: BattleInputState,
  ): void {
    if (!this.options.isLogicReady() || elapsedMs <= 0) return;
    const framesToCatchUp = Math.floor(elapsedMs / this.options.fixedStepMs);
    if (framesToCatchUp <= 0) {
      this.accumulator = elapsedMs;
      return;
    }
    for (let frame = 0; frame < framesToCatchUp; frame += 1) {
      if (this.options.isSyncRunning()) {
        this.options.stepSync(lastInput);
      } else {
        this.stepRuntimeWithInput(lastInput);
      }
      this.updateAutoReloadObservation(localFighterKey, lastInput);
    }
    this.accumulator = elapsedMs - framesToCatchUp * this.options.fixedStepMs;
  }

  private advanceFrame(localFighterKey: FighterKey): void {
    if (this.options.isInputLocked()) return;
    const fighter = this.localFighterState(localFighterKey);
    const input = this.options.createInput(
      fighter,
      this.autoReloadObservedShotsFired,
    );
    const targetInput = this.options.localSingleDevice
      ? this.options.createTargetInput(
          this.runtime.state.target,
          this.targetAutoReloadObservedShotsFired,
        )
      : undefined;

    if (this.options.isSyncRunning() && this.options.isLogicReady()) {
      this.options.stepSync(input);
    } else if (this.runtime.gameOver && this.options.shouldFinishBattle()) {
      this.options.finishBattle();
    } else if (this.options.isLogicReady()) {
      this.stepRuntimeWithInput(input, targetInput);
    }

    this.updateAutoReloadObservation(localFighterKey, input);
    if (targetInput) this.updateTargetAutoReloadObservation(targetInput);
    if (this.options.isLogicReady() && !this.options.isInputLocked()) {
      this.options.recordInputFrame(
        this.runtime.frame,
        this.runtime.lastPlayerInput ?? input,
        this.runtime.lastTargetInput ?? input,
      );
    }
  }

  private updateAutoReloadObservation(
    localFighterKey: FighterKey,
    input: BattleInputState,
  ): void {
    const fighter = this.localFighterState(localFighterKey);
    if (
      input.reloadPressed ||
      fighter.reloadRemaining > 0 ||
      fighter.ammo > 0 ||
      fighter.shotsFired <= this.autoReloadObservedShotsFired
    ) {
      this.autoReloadObservedShotsFired = fighter.shotsFired;
    }
  }

  private updateTargetAutoReloadObservation(input: BattleInputState): void {
    const fighter = this.runtime.state.target;
    if (
      input.reloadPressed ||
      fighter.reloadRemaining > 0 ||
      fighter.ammo > 0 ||
      fighter.shotsFired <= this.targetAutoReloadObservedShotsFired
    ) {
      this.targetAutoReloadObservedShotsFired = fighter.shotsFired;
    }
  }
}
