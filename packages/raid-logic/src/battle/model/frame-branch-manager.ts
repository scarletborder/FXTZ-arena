import type {
  BattleFrameContext,
  BattleFrameInputPair,
} from "./frame-pipeline-types";

export type BattleFrameBranchResult = "handled" | "pass";

export interface BattleFrameBranchManager {
  advance(inputPair: BattleFrameInputPair): BattleFrameBranchResult;
}

export function createBattleFrameBranchManagers(
  context: BattleFrameContext,
): readonly BattleFrameBranchManager[] {
  return [
    new CollaborateTransitionBranchManager(context),
    new CollaborateShopBranchManager(context),
    new RunningBattleBranchManager(context),
  ];
}

class CollaborateTransitionBranchManager implements BattleFrameBranchManager {
  constructor(private readonly context: BattleFrameContext) {}

  advance(inputPair: BattleFrameInputPair): BattleFrameBranchResult {
    return this.context.processCollaborateTransitionSync(inputPair)
      ? "handled"
      : "pass";
  }
}

class CollaborateShopBranchManager implements BattleFrameBranchManager {
  constructor(private readonly context: BattleFrameContext) {}

  advance(inputPair: BattleFrameInputPair): BattleFrameBranchResult {
    if (!this.context.isCollaborateShopOpen()) {
      return "pass";
    }

    this.context.processCollaborateShopInputs(inputPair);
    this.context.stepMobSpawner();
    if (!this.context.isCollaborateShopOpen()) {
      runBattleFrame(this.context, inputPair);
    }
    return "handled";
  }
}

class RunningBattleBranchManager implements BattleFrameBranchManager {
  constructor(private readonly context: BattleFrameContext) {}

  advance(inputPair: BattleFrameInputPair): BattleFrameBranchResult {
    runBattleFrame(this.context, inputPair);
    return "handled";
  }
}

function runBattleFrame(
  context: BattleFrameContext,
  inputPair: BattleFrameInputPair,
): void {
  if (context.beginRunningFrame()) {
    return;
  }

  context.processFighterActions(inputPair);
  context.stepMobSpawner();
  context.stepNeutralMobs();

  context.resolveProjectileClashes();
  context.stepProjectiles();
  context.removeInactiveNeutralMobs();
  context.stepPoints();
  context.syncPointBodies();
  context.flushDeferredSpawns();
  context.stepEffects();
}
