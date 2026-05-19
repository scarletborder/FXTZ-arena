import type { BattleCollectionsContext, BattleFrameContext, BattleStatsContext, FighterDuelContext } from "./state";
import type { EffectOperationContext, ProjectileOperationContext } from "./operations";

export interface BattleActionContext<
  TFighter,
  TProjectile,
  TEffect,
  TStats,
  TBulletParams,
  TLaserParams,
> extends BattleFrameContext,
    BattleStatsContext<TStats>,
    BattleCollectionsContext<TProjectile, TEffect>,
    FighterDuelContext<TFighter>,
    ProjectileOperationContext<TBulletParams, TLaserParams>,
    EffectOperationContext {}
