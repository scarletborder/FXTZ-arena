import type { BattleFrameBranchManager } from "./frame-branch-manager";
import type {
  BattleFramePipelineContext,
  BattleFrameInputPair,
} from "./frame-pipeline-types";

export type { BattleFrameInputPair, BattleFramePipelineContext };

export class BattleFramePipeline {
  constructor(
    private readonly context: BattleFramePipelineContext,
    private readonly branchManagers: readonly BattleFrameBranchManager[],
  ) {}

  advance(inputPair: BattleFrameInputPair): void {
    this.context.ensurePhysicsReady();
    this.context.beginFrame();

    for (const branchManager of this.branchManagers) {
      if (branchManager.advance(inputPair) === "handled") {
        return;
      }
    }
  }
}
