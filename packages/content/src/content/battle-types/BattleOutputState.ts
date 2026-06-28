import type { MobState } from "@repo/types";
import type { EffectState } from "./EffectState";
import type { FighterState } from "./FighterState";
import type { PointState } from "./PointState";
import type { ProjectileState } from "./ProjectileState";
import type { ShieldState } from "./ShieldState";
import type { TrainingStats } from "./TrainingStats";
import type { CollaborateExtraState } from "@repo/types";

export type BattleResult =
  | "running"
  | "versus_player1"
  | "versus_player2"
  | "collaborate_victory"
  | "collaborate_defeat";

export interface BattleOutputState {
  readonly frame: number;
  readonly gameOver: boolean;
  readonly result: BattleResult;
  readonly player: FighterState;
  readonly target: FighterState;
  readonly points: readonly PointState[];
  readonly neutralMobs: readonly MobState[];
  readonly projectiles: readonly ProjectileState[];
  readonly effects: readonly EffectState[];
  readonly shields: readonly ShieldState[];
  readonly stats: TrainingStats;
  readonly collaborateExtra?: CollaborateExtraState;
}
