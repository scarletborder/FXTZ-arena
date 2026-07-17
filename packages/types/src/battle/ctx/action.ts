import type {
  BattleCollectionsContext,
  BattleFrameContext,
  BattleStatsContext,
  BattleTargetState,
  FighterDuelContext,
} from "./state";
import type {
  EffectOperationContext,
  ProjectileOperationContext,
} from "./operations";

export interface BattleActionContext<
  TFighter,
  TProjectile,
  TEffect,
  TStats,
  TBulletParams,
  TLaserParams,
  TMob = unknown,
> extends BattleFrameContext,
    BattleStatsContext<TStats>,
    BattleCollectionsContext<TProjectile, TEffect>,
    FighterDuelContext<TFighter>,
    ProjectileOperationContext<TBulletParams, TLaserParams>,
    EffectOperationContext {
  readonly mobs?: readonly TMob[];
  readonly enemyTargets?: readonly BattleTargetState[];
  readonly aim?: { readonly x: number; readonly y: number };
  consumeAim?(): void;
  allocateMobId?(): number;
  spawnMob?(mob: TMob): void;
}
