import type { BattleInputState } from "@repo/types";

export interface BattleFrameInputPair {
  readonly firstInput: BattleInputState;
  readonly secondInput: BattleInputState | undefined;
  readonly firstIsPlayer: boolean;
}

export interface BattleFramePipelineContext {
  ensurePhysicsReady(): void;
  beginFrame(): void;
  processCollaborateTransitionSync(inputPair: BattleFrameInputPair): boolean;
  isCollaborateShopOpen(): boolean;
  processCollaborateShopInputs(inputPair: BattleFrameInputPair): void;
  stepMobSpawner(): void;
  beginRunningFrame(): boolean;
  processFighterActions(inputPair: BattleFrameInputPair): void;
  stepProjectileCommands(): void;
  stepNeutralMobs(): void;
  resolveProjectileClashes(): void;
  stepProjectiles(): void;
  removeInactiveNeutralMobs(): void;
  stepPoints(): void;
  syncPointBodies(): void;
  flushDeferredSpawns(): void;
  stepEffects(): void;
}
