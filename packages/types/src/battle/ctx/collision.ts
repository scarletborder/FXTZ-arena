export interface ProjectileCollisionContext<TProjectile, TFighter, TFighterKey extends string> {
  readonly projectile: TProjectile;
  readonly owner: TFighterKey;
  readonly victim: TFighter;
  readonly damage: number;
}
