import type {
  CharacterActionContext,
  BattleBulletSpawnParams,
  BattleLaserSpawnParams,
  BattleSegmentSpawnParams,
} from "@repo/content";
import type {
  ArenaBounds,
  BattlePlayerId,
  NeutralMobActionContext,
} from "@repo/types";
import type {
  BulletProjectileParams,
  LaserProjectileParams,
} from "./projectile";
import type {
  EffectState,
  FighterKey,
  FighterState,
  ProjectileState,
  TrainingStats,
} from "@repo/content";

type BattleModelContextBindings = {
  readonly frame: number;
  readonly self: FighterState;
  readonly opponent: FighterState;
  readonly enemyTargets?: readonly {
    readonly key: FighterKey;
    readonly x: number;
    readonly y: number;
    readonly hitRadius: number;
    readonly hitWidth?: number;
    readonly hitHeight?: number;
    readonly mobId?: number;
  }[];
  readonly projectiles: readonly ProjectileState[];
  readonly effects: readonly EffectState[];
  readonly stats: TrainingStats;
  spawnBullet(params: BattleBulletSpawnParams): void;
  spawnLaser(params: BattleLaserSpawnParams): void;
  spawnSegment(params: BattleSegmentSpawnParams): void;
  clearProjectilesAround(params: {
    readonly x: number;
    readonly y: number;
    readonly radius: number;
  }): number;
  spawnClearRingEntity(params: {
    readonly x: number;
    readonly y: number;
    readonly radius: number;
    readonly duration: number;
    readonly followsOwner?: boolean;
  }): void;
  spawnClearRing(params: {
    readonly x: number;
    readonly y: number;
    readonly radius: number;
    readonly tint: number;
    readonly duration: number;
  }): void;
  pauseProjectileTimeline(projectile: ProjectileState, ticks: number): void;
  consumeAim(): void;
};

export function createCharacterActionContext(
  bindings: BattleModelContextBindings,
): CharacterActionContext {
  return {
    frame: bindings.frame,
    self: bindings.self,
    opponent: bindings.opponent,
    enemyTargets: bindings.enemyTargets,
    consumeAim: bindings.consumeAim,
    projectiles:
      bindings.projectiles as unknown as CharacterActionContext["projectiles"],
    effects: bindings.effects as unknown as CharacterActionContext["effects"],
    stats: bindings.stats,
    spawnBullet: (params) => bindings.spawnBullet(params),
    spawnLaser: (params) => bindings.spawnLaser(params),
    spawnSegment: (params) => bindings.spawnSegment(params),
    clearProjectilesAround: (params) => bindings.clearProjectilesAround(params),
    spawnClearRingEntity: (params) => bindings.spawnClearRingEntity(params),
    spawnClearRing: (params) => bindings.spawnClearRing(params),
    pauseProjectileTimeline: (projectile, ticks) =>
      bindings.pauseProjectileTimeline(projectile, ticks),
  };
}

export function createNeutralMobActionContext(bindings: {
  readonly frame: number;
  readonly arenaBounds: ArenaBounds;
  readonly owner: BattlePlayerId;
  readonly player: { readonly x: number; readonly y: number };
  readonly target: { readonly x: number; readonly y: number };
  spawnBullet(params: BulletProjectileParams): void;
  spawnLaser(params: LaserProjectileParams): void;
}): NeutralMobActionContext<BulletProjectileParams, LaserProjectileParams> {
  return {
    frame: bindings.frame,
    arenaBounds: bindings.arenaBounds,
    owner: bindings.owner,
    player: { x: bindings.player.x, y: bindings.player.y },
    target: { x: bindings.target.x, y: bindings.target.y },
    spawnBullet: (params) => {
      bindings.spawnBullet({
        ...params,
        owner: bindings.owner,
        sourceCharacterId: undefined,
        frame: params.frame ?? bindings.frame,
      });
    },
    spawnLaser: (params) => {
      bindings.spawnLaser({
        ...params,
        owner: bindings.owner,
        sourceCharacterId: undefined,
        frame: params.frame ?? bindings.frame,
      });
    },
  };
}
