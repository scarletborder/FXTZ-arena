import type { BattleFrameBranchManager } from "./frame-branch-manager";
import type {
  BattleFrameContext,
  BattleFrameInputPair,
} from "./frame-pipeline-types";

export type { BattleFrameContext, BattleFrameInputPair };

export class BattleFramePipeline {
  constructor(
    private readonly context: BattleFrameContext,
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
