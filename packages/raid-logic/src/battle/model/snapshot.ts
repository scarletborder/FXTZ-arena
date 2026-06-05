import type { NeutralMobState } from "@repo/types";
import type { AbilityCardDefinition, CharacterDefinition } from "@repo/content";

import { getAbilityCard, getCharacter } from "../content";
import type {
  EffectState,
  FighterState,
  PointState,
  ProjectileState,
  TrainingStats,
} from "@repo/content";
import type { NeutralMobSpawnerState } from "@repo/content";
import type { ClearRingState } from "./entities/clear-ring";
import {
  TickerManager,
  type ProjectileTimerSnapshot,
  type TickerManagerSnapshot,
} from "./ticker-manager";

export interface BattleModelSnapshot {
  readonly version: 1;
  readonly frame: number;
  readonly gameOver: boolean;
  readonly nextProjectileId: number;
  readonly nextEffectId: number;
  readonly nextNeutralMobId: number;
  readonly nextPointId: number;
  readonly nextClearRingId: number;
  readonly player: FighterSnapshot;
  readonly target: FighterSnapshot;
  readonly neutralMobs: readonly NeutralMobSnapshot[];
  readonly points: readonly PointSnapshot[];
  readonly clearRings: readonly ClearRingSnapshot[];
  readonly mobSpawner: NeutralMobSpawnerState | undefined;
  readonly ticker?: TickerManagerSnapshot;
  readonly projectiles: readonly ProjectileSnapshot[];
  readonly effects: readonly EffectSnapshot[];
  readonly stats: TrainingStats;
}

export type FighterSnapshot = Omit<
  FighterState,
  | "primaryCharacter"
  | "activeCharacter"
  | "alternateCharacter"
  | "activeCard"
  | "abilityCards"
  | "flashUntil"
  | "statusVisibleUntil"
> & {
  readonly primaryCharacterId: CharacterDefinition["id"];
  readonly activeCharacterId: CharacterDefinition["id"];
  readonly alternateCharacterId: CharacterDefinition["id"];
  readonly activeCardId: AbilityCardDefinition["id"] | undefined;
  readonly abilityCardIds: readonly AbilityCardDefinition["id"][];
  readonly flashRemaining: number;
  readonly statusVisibleRemaining: number;
};

export type ProjectileSnapshot = Omit<
  ProjectileState,
  | "visibleFrom"
  | "expireAt"
  | "homingStartAt"
  | "homingUntil"
  | "pausedUntil"
  | "retargetAt"
> &
  ProjectileTimerSnapshot;

export type EffectSnapshot = Omit<EffectState, "expireAt"> & {
  readonly expireIn: number;
};

export type ClearRingSnapshot = Omit<ClearRingState, "expireAt"> & {
  readonly expireIn: number;
};

export type NeutralMobSnapshot = NeutralMobState;
export type PointSnapshot = PointState;

export function createBattleModelSnapshot(params: {
  readonly frame: number;
  readonly gameOver: boolean;
  readonly player: FighterState;
  readonly target: FighterState;
  readonly projectiles: readonly ProjectileState[];
  readonly effects: readonly EffectState[];
  readonly stats: TrainingStats;
  readonly nextProjectileId: number;
  readonly nextEffectId: number;
  readonly nextNeutralMobId: number;
  readonly nextPointId: number;
  readonly nextClearRingId: number;
  readonly neutralMobs: readonly NeutralMobState[];
  readonly points: readonly PointState[];
  readonly clearRings: readonly ClearRingState[];
  readonly mobSpawner: NeutralMobSpawnerState | undefined;
  readonly ticker?: TickerManagerSnapshot;
}): BattleModelSnapshot {
  const ticker = new TickerManager();
  ticker.setCurrentFrame(params.frame);
  return {
    version: 1,
    frame: params.frame,
    gameOver: params.gameOver,
    nextProjectileId: params.nextProjectileId,
    nextEffectId: params.nextEffectId,
    nextNeutralMobId: params.nextNeutralMobId,
    nextPointId: params.nextPointId,
    nextClearRingId: params.nextClearRingId,
    player: serializeFighter(params.player, params.frame),
    target: serializeFighter(params.target, params.frame),
    neutralMobs: params.neutralMobs.map((mob) => ({ ...mob })),
    points: params.points.map((point) => ({ ...point })),
    clearRings: params.clearRings.map((ring) =>
      serializeClearRing(ring, params.frame),
    ),
    mobSpawner: params.mobSpawner,
    ticker: params.ticker,
    projectiles: params.projectiles.map((projectile) =>
      serializeProjectile(projectile, ticker),
    ),
    effects: params.effects.map((effect) =>
      serializeEffect(effect, params.frame),
    ),
    stats: { ...params.stats },
  };
}

export function restoreFighterSnapshot(
  fighter: FighterState,
  snapshot: FighterSnapshot,
  frame: number,
): void {
  Object.assign(fighter, {
    ...snapshot,
    primaryCharacter: getCharacter(snapshot.primaryCharacterId),
    activeCharacter: getCharacter(snapshot.activeCharacterId),
    alternateCharacter: getCharacter(snapshot.alternateCharacterId),
    activeCard: snapshot.activeCardId
      ? getAbilityCard(snapshot.activeCardId)
      : undefined,
    abilityCards: snapshot.abilityCardIds.map((id) => getAbilityCard(id)),
    flashUntil: frame + snapshot.flashRemaining,
    statusVisibleUntil: frame + snapshot.statusVisibleRemaining,
  });
  deleteSnapshotIds(fighter);
}

export function restoreProjectileSnapshot(
  snapshot: ProjectileSnapshot,
  ticker: TickerManager,
): ProjectileState {
  const {
    visibleIn,
    expireIn,
    homingStartIn,
    homingRemaining,
    pausedRemaining,
    retargetIn,
    ...projectile
  } = snapshot;
  return {
    ...projectile,
    ...ticker.restoreProjectileTimers({
      visibleIn,
      expireIn,
      homingStartIn,
      homingRemaining,
      pausedRemaining,
      retargetIn,
    }),
  };
}

export function restoreEffectSnapshot(
  snapshot: EffectSnapshot,
  frame: number,
): EffectState {
  const { expireIn, ...effect } = snapshot;
  return {
    ...effect,
    expireAt: frame + expireIn,
  };
}

export function restoreClearRingSnapshot(
  snapshot: ClearRingSnapshot,
  frame: number,
): ClearRingState {
  const { expireIn, ...ring } = snapshot;
  return {
    ...ring,
    expireAt: frame + expireIn,
  };
}

function serializeFighter(
  fighter: FighterState,
  frame: number,
): FighterSnapshot {
  return {
    key: fighter.key,
    x: fighter.x,
    y: fighter.y,
    facing: fighter.facing,
    previousX: fighter.previousX,
    previousY: fighter.previousY,
    previousFacing: fighter.previousFacing,
    lives: fighter.lives,
    bombs: fighter.bombs,
    pointCount: fighter.pointCount,
    ammo: fighter.ammo,
    ammoDisplay: fighter.ammoDisplay,
    ammoCapacity: fighter.ammoCapacity,
    reloadRemaining: fighter.reloadRemaining,
    reloadTotal: fighter.reloadTotal,
    reloadStartedAmmo: fighter.reloadStartedAmmo,
    reloadCharacterId: fighter.reloadCharacterId,
    invulnerableUntil: fighter.invulnerableUntil,
    invulnerableDelayRemaining: fighter.invulnerableDelayRemaining,
    invulnerableDelayDuration: fighter.invulnerableDelayDuration,
    hitCircleRadiusMultiplier: fighter.hitCircleRadiusMultiplier,
    reisenShieldLayers: fighter.reisenShieldLayers,
    deadUntil: fighter.deadUntil,
    actionLockedUntil: fighter.actionLockedUntil,
    nonFireActionLockedUntil: fighter.nonFireActionLockedUntil,
    switchLockedUntil: fighter.switchLockedUntil,
    movementLockedUntil: fighter.movementLockedUntil,
    projectilePauseUntil: fighter.projectilePauseUntil,
    timeStopUntil: fighter.timeStopUntil,
    moveSpeedOverride: fighter.moveSpeedOverride,
    moveSpeedOverrideUntil: fighter.moveSpeedOverrideUntil,
    moveSpeedOverrideDelayRemaining: fighter.moveSpeedOverrideDelayRemaining,
    pendingMoveSpeedOverride: fighter.pendingMoveSpeedOverride,
    pendingMoveSpeedOverrideDuration: fighter.pendingMoveSpeedOverrideDuration,
    primaryCharacterId: fighter.primaryCharacter.id,
    activeCharacterId: fighter.activeCharacter.id,
    alternateCharacterId: fighter.alternateCharacter.id,
    activeCardId: fighter.activeCard?.id,
    abilityCardIds: fighter.abilityCards.map((card) => card.id),
    activeCardUses: fighter.activeCardUses,
    activeCardCooldownUntil: fighter.activeCardCooldownUntil,
    fireCooldownUntil: fighter.fireCooldownUntil,
    bombCooldownUntil: fighter.bombCooldownUntil,
    shotsFired: fighter.shotsFired,
    hits: fighter.hits,
    hitsTaken: fighter.hitsTaken,
    damageTaken: fighter.damageTaken,
    deaths: fighter.deaths,
    bombUses: fighter.bombUses,
    flashRemaining: fighter.flashUntil - frame,
    statusVisibleRemaining: fighter.statusVisibleUntil - frame,
    ammoByCharacterId: { ...fighter.ammoByCharacterId },
    grazedProjectileIds: [...fighter.grazedProjectileIds],
  };
}

function serializeProjectile(
  projectile: ProjectileState,
  ticker: TickerManager,
): ProjectileSnapshot {
  return {
    id: projectile.id,
    kind: projectile.kind,
    owner: projectile.owner,
    sourceCharacterId: projectile.sourceCharacterId,
    textureKey: projectile.textureKey,
    x: projectile.x,
    y: projectile.y,
    previousX: projectile.previousX,
    previousY: projectile.previousY,
    vx: projectile.vx,
    vy: projectile.vy,
    width: projectile.width,
    previousWidth: projectile.previousWidth,
    height: projectile.height,
    renderWidth: projectile.renderWidth,
    renderHeight: projectile.renderHeight,
    anchorX: projectile.anchorX,
    anchorY: projectile.anchorY,
    ...ticker.serializeProjectileTimers(projectile),
    retargetSpeed: projectile.retargetSpeed,
    retargetX: projectile.retargetX,
    retargetY: projectile.retargetY,
    retargetAimOwner: projectile.retargetAimOwner,
    widthGrowthPerTick: projectile.widthGrowthPerTick,
    maxWidth: projectile.maxWidth,
    damage: projectile.damage,
    angle: projectile.angle,
    couldClear: projectile.couldClear,
    clearsProjectiles: projectile.clearsProjectiles,
    piercesTargets: projectile.piercesTargets,
    polarOriginX: projectile.polarOriginX,
    polarOriginY: projectile.polarOriginY,
    polarRadius: projectile.polarRadius,
    polarAngle: projectile.polarAngle,
    polarRadialSpeed: projectile.polarRadialSpeed,
    polarAngularSpeed: projectile.polarAngularSpeed,
    polarFollowOwner: projectile.polarFollowOwner,
  };
}

function serializeEffect(effect: EffectState, frame: number): EffectSnapshot {
  return {
    id: effect.id,
    kind: effect.kind,
    x: effect.x,
    y: effect.y,
    tint: effect.tint,
    scale: effect.scale,
    expireIn: effect.expireAt - frame,
    text: effect.text,
    width: effect.width,
    height: effect.height,
    angle: effect.angle,
  };
}

function serializeClearRing(
  ring: ClearRingState,
  frame: number,
): ClearRingSnapshot {
  return {
    id: ring.id,
    owner: ring.owner,
    x: ring.x,
    y: ring.y,
    previousX: ring.previousX,
    previousY: ring.previousY,
    radius: ring.radius,
    expireIn: ring.expireAt - frame,
    followsOwner: ring.followsOwner,
  };
}

function deleteSnapshotIds(fighter: FighterState): void {
  const snapshotShape = fighter as FighterState & {
    primaryCharacterId?: string;
    activeCharacterId?: string;
    alternateCharacterId?: string;
    activeCardId?: string;
    abilityCardIds?: readonly string[];
    flashRemaining?: number;
    statusVisibleRemaining?: number;
  };
  delete snapshotShape.primaryCharacterId;
  delete snapshotShape.activeCharacterId;
  delete snapshotShape.alternateCharacterId;
  delete snapshotShape.activeCardId;
  delete snapshotShape.abilityCardIds;
  delete snapshotShape.flashRemaining;
  delete snapshotShape.statusVisibleRemaining;
}
