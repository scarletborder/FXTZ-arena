import type { FighterState, PointState, ProjectileState } from "@repo/content";
import type { NeutralMobState } from "@repo/types";

import type { DodgeIntent, DodgeResult } from "../dodger";
import type { IntelligenceResult } from "../intelligence";
import type { StrategyAction } from "../strategy";

export interface CpuPresetContext {
  readonly frame: number;
  readonly self: FighterState;
  readonly opponent: FighterState;
  readonly projectiles: readonly ProjectileState[];
  readonly neutralMobs: readonly NeutralMobState[];
  readonly points: readonly PointState[];
  readonly dodgeResult: DodgeResult;
  readonly intel: IntelligenceResult;
}

export interface CpuPresetMovementContext {
  readonly frame: number;
  readonly self: FighterState;
  readonly opponent: FighterState;
  readonly projectiles: readonly ProjectileState[];
  readonly neutralMobs: readonly NeutralMobState[];
  readonly points: readonly PointState[];
  readonly intel: IntelligenceResult;
}

export interface CpuPresetDecision extends StrategyAction {
  readonly strategicMove?: DodgeIntent;
}

export interface CpuPreset {
  readonly id: string;
  matches(self: FighterState): boolean;
  getDesiredMove?(ctx: CpuPresetMovementContext): DodgeIntent | undefined;
  getDecision(ctx: CpuPresetContext): CpuPresetDecision;
  reset(): void;
}
