import type { NeutralMobState } from "@repo/types";
import type { EffectState } from "./EffectState";
import type { FighterState } from "./FighterState";
import type { PointState } from "./PointState";
import type { ProjectileState } from "./ProjectileState";
import type { ShieldState } from "./ShieldState";
import type { TrainingStats } from "./TrainingStats";

export interface BattleOutputState {
  readonly frame: number;
  readonly gameOver: boolean;
  readonly player: FighterState;
  readonly target: FighterState;
  readonly points: readonly PointState[];
  readonly neutralMobs: readonly NeutralMobState[];
  readonly projectiles: readonly ProjectileState[];
  readonly effects: readonly EffectState[];
  readonly shields: readonly ShieldState[];
  readonly stats: TrainingStats;
}
