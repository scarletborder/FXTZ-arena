import type { BattleActionContext } from "./action";

export interface HitResolutionContext {
  defaultBombs: number;
}

export interface BattleHitContext<
  TFighter,
  TProjectile,
  TEffect,
  TStats,
  TBulletParams,
  TLaserParams,
  TCard,
  TFighterKey extends string,
> extends BattleActionContext<TFighter, TProjectile, TEffect, TStats, TBulletParams, TLaserParams> {
  readonly owner: TFighterKey;
  readonly victim: TFighter;
  readonly attacker: TFighter;
  readonly damage: number;
  readonly before: {
    readonly victim: TFighter;
    readonly attacker: TFighter;
  };
  readonly cards: {
    readonly victim: readonly TCard[];
    readonly attacker: readonly TCard[];
  };
  readonly resolution: HitResolutionContext;
}
