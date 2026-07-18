export interface ClearProjectilesAroundParams {
  readonly x: number;
  readonly y: number;
  readonly radius: number;
}

export interface SpawnRingEffectParams {
  readonly x: number;
  readonly y: number;
  readonly tint: number;
  readonly scale: number;
  readonly scalePerTick?: number;
  readonly duration: number;
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

export interface ProjectileOperationContext<TBulletParams, TLaserParams> {
  spawnBullet(params: TBulletParams): void;
  spawnLaser(params: TLaserParams): void;
  clearProjectilesAround(params: ClearProjectilesAroundParams): number;
}

export interface EffectOperationContext {
  spawnEffectRing(params: SpawnRingEffectParams): void;
  spawnClearRing(params: SpawnClearRingParams): void;
  spawnClearRingEntity(params: SpawnClearRingEntityParams): void;
}
