// ──────────────────────────────────────────────
// Battle context types (locally defined to avoid
// circular dependency with @repo/types).
// ──────────────────────────────────────────────

export interface HitResolutionContext {
  defaultBombs: number;
  ignored?: boolean;
}

export interface ClearProjectilesAroundParams {
  readonly x: number;
  readonly y: number;
  readonly radius: number;
}

export interface SpawnClearRingParams {
  readonly x: number;
  readonly y: number;
  readonly radius: number;
  readonly tint: number;
  readonly duration: number;
}

export interface SpawnClearRingEntityParams {
  readonly x: number;
  readonly y: number;
  readonly radius: number;
  readonly duration: number;
  readonly followsOwner?: boolean;
}

export interface BattleTargetState<TFighterKey extends string = string> {
  readonly key: TFighterKey;
  readonly x: number;
  readonly y: number;
  readonly hitRadius?: number;
  readonly hitWidth?: number;
  readonly hitHeight?: number;
  readonly mobId?: number;
}

export interface BattleActionContext<
  TFighter,
  TProjectile,
  TEffect,
  TStats,
  TBulletParams,
  TLaserParams,
  TMob = unknown,
> {
  readonly frame: number;
  readonly stats: TStats;
  readonly projectiles: TProjectile[];
  readonly mobs?: readonly TMob[];
  readonly effects: TEffect[];
  readonly self: TFighter;
  readonly opponent: TFighter;
  readonly enemyTargets?: readonly BattleTargetState[];
  readonly aim?: { readonly x: number; readonly y: number };
  consumeAim?(): void;
  spawnBullet(params: TBulletParams): void;
  spawnLaser(params: TLaserParams): void;
  allocateMobId?(): number;
  spawnMob?(mob: TMob): void;
  clearProjectilesAround(params: ClearProjectilesAroundParams): number;
  spawnClearRingEntity(params: SpawnClearRingEntityParams): void;
  spawnClearRing(params: SpawnClearRingParams): void;
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
> extends BattleActionContext<
    TFighter,
    TProjectile,
    TEffect,
    TStats,
    TBulletParams,
    TLaserParams
  > {
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
