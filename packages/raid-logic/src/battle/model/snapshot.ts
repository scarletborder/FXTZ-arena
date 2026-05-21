import type { NeutralMobState } from "@repo/types";
import type { AbilityCardDefinition, CharacterDefinition } from "@repo/content";

import { getAbilityCard, getCharacter } from "../content";
import type { EffectState, FighterState, ProjectileState, TrainingStats } from "@repo/content";
import type { NeutralMobSpawnerState } from "@repo/content";

export interface BattleModelSnapshot {
  readonly version: 1;
  readonly frame: number;
  readonly gameOver: boolean;
  readonly nextProjectileId: number;
  readonly nextEffectId: number;
  readonly nextNeutralMobId: number;
  readonly player: FighterSnapshot;
  readonly target: FighterSnapshot;
  readonly neutralMobs: readonly NeutralMobSnapshot[];
  readonly mobSpawner: NeutralMobSpawnerState | undefined;
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
  "visibleFrom" | "expireAt" | "homingStartAt" | "homingUntil" | "pausedUntil"
> & {
  readonly visibleIn: number;
  readonly expireIn: number | undefined;
  readonly homingStartIn: number;
  readonly homingRemaining: number;
  readonly pausedRemaining: number;
};

export type EffectSnapshot = Omit<EffectState, "expireAt"> & {
  readonly expireIn: number;
};

export type NeutralMobSnapshot = NeutralMobState;

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
  readonly neutralMobs: readonly NeutralMobState[];
  readonly mobSpawner: NeutralMobSpawnerState | undefined;
}): BattleModelSnapshot {
  return {
    version: 1,
    frame: params.frame,
    gameOver: params.gameOver,
    nextProjectileId: params.nextProjectileId,
    nextEffectId: params.nextEffectId,
    nextNeutralMobId: params.nextNeutralMobId,
    player: serializeFighter(params.player, params.frame),
    target: serializeFighter(params.target, params.frame),
    neutralMobs: params.neutralMobs.map((mob) => ({ ...mob })),
    mobSpawner: params.mobSpawner,
    projectiles: params.projectiles.map((projectile) => serializeProjectile(projectile, params.frame)),
    effects: params.effects.map((effect) => serializeEffect(effect, params.frame)),
    stats: { ...params.stats },
  };
}

export function restoreFighterSnapshot(fighter: FighterState, snapshot: FighterSnapshot, frame: number): void {
  Object.assign(fighter, {
    ...snapshot,
    primaryCharacter: getCharacter(snapshot.primaryCharacterId),
    activeCharacter: getCharacter(snapshot.activeCharacterId),
    alternateCharacter: getCharacter(snapshot.alternateCharacterId),
    activeCard: snapshot.activeCardId ? getAbilityCard(snapshot.activeCardId) : undefined,
    abilityCards: snapshot.abilityCardIds.map((id) => getAbilityCard(id)),
    flashUntil: frame + snapshot.flashRemaining,
    statusVisibleUntil: frame + snapshot.statusVisibleRemaining,
  });
  deleteSnapshotIds(fighter);
}

export function restoreProjectileSnapshot(snapshot: ProjectileSnapshot, frame: number): ProjectileState {
  const { visibleIn, expireIn, homingStartIn, homingRemaining, pausedRemaining, ...projectile } = snapshot;
  return {
    ...projectile,
    visibleFrom: frame + visibleIn,
    expireAt: expireIn === undefined ? undefined : frame + expireIn,
    homingStartAt: frame + homingStartIn,
    homingUntil: frame + homingRemaining,
    pausedUntil: frame + pausedRemaining,
  };
}

export function restoreEffectSnapshot(snapshot: EffectSnapshot, frame: number): EffectState {
  const { expireIn, ...effect } = snapshot;
  return {
    ...effect,
    expireAt: frame + expireIn,
  };
}

function serializeFighter(fighter: FighterState, frame: number): FighterSnapshot {
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
    deadUntil: fighter.deadUntil,
    actionLockedUntil: fighter.actionLockedUntil,
    nonFireActionLockedUntil: fighter.nonFireActionLockedUntil,
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
    damageTaken: fighter.damageTaken,
    deaths: fighter.deaths,
    bombUses: fighter.bombUses,
    flashRemaining: fighter.flashUntil - frame,
    statusVisibleRemaining: fighter.statusVisibleUntil - frame,
    ammoByCharacterId: { ...fighter.ammoByCharacterId },
  };
}

function serializeProjectile(projectile: ProjectileState, frame: number): ProjectileSnapshot {
  return {
    id: projectile.id,
    kind: projectile.kind,
    owner: projectile.owner,
    x: projectile.x,
    y: projectile.y,
    previousX: projectile.previousX,
    previousY: projectile.previousY,
    vx: projectile.vx,
    vy: projectile.vy,
    width: projectile.width,
    previousWidth: projectile.previousWidth,
    height: projectile.height,
    anchorX: projectile.anchorX,
    anchorY: projectile.anchorY,
    visibleIn: projectile.visibleFrom - frame,
    expireIn: projectile.expireAt === undefined ? undefined : projectile.expireAt - frame,
    homingStartIn: projectile.homingStartAt - frame,
    homingRemaining: projectile.homingUntil - frame,
    pausedRemaining: projectile.pausedUntil - frame,
    widthGrowthPerTick: projectile.widthGrowthPerTick,
    maxWidth: projectile.maxWidth,
    damage: projectile.damage,
    angle: projectile.angle,
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
