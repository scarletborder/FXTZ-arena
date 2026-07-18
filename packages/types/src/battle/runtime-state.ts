import type { AbilityCardDefinition, CharacterDefinition } from "../core";
import type { BattlePlayerId } from "../core";
import type { CollaborateExtraState } from "./collaborate-extra";
import type { MobState } from "./neutral-mob";

export type FighterKey = BattlePlayerId;
export type ProjectileKind = "orb" | "knife" | "diamond" | "laser" | "spark";
export type LaserRenderMode = "scaled" | "tiled";
export type LaserVisualStyle = "th06";

export interface FighterMetaState {
  readonly key: FighterKey;
}

export interface FighterPositionState {
  x: number;
  y: number;
  facing: number;
  previousX: number;
  previousY: number;
  previousFacing: number;
}

export interface FighterResourceState {
  lives: number;
  bombs: number;
  pointCount: number;
}

export interface FighterAmmoState {
  ammo: number;
  ammoDisplay: number;
  ammoCapacity: number;
  reloadRemaining: number;
  reloadTotal: number;
  reloadStartedAmmo: number;
  reloadCharacterId: CharacterDefinition["id"] | undefined;
  ammoByCharacterId: Record<string, number>;
}

export interface FighterCharacterState {
  primaryCharacter: CharacterDefinition;
  activeCharacter: CharacterDefinition;
  alternateCharacter: CharacterDefinition;
}

export interface FighterAbilityCardState {
  activeCard: AbilityCardDefinition | undefined;
  abilityCards: readonly AbilityCardDefinition[];
  activeCardUses: number;
  activeCardCooldownUntil: number;
  hakkeroBeamCooldownUntil: number;
  sakuraCharmGuardAvailable: boolean;
}

export interface FighterStatsState {
  shotsFired: number;
  hits: number;
  hitsTaken: number;
  damageTaken: number;
  deaths: number;
  bombUses: number;
}

export interface MarisaExtraFighterState {
  moveSpeedOverride: CharacterDefinition["moveSpeed"] | undefined;
  moveSpeedOverrideUntil: number;
  moveSpeedOverrideDelayRemaining: number;
  pendingMoveSpeedOverride: CharacterDefinition["moveSpeed"] | undefined;
  pendingMoveSpeedOverrideDuration: number;
}

export interface ReisenExtraFighterState {
  reisenShieldLayers: number;
  hitCircleRadiusMultiplier: number;
}

export interface YoumuExtraFighterState {
  youmuBombDashDelayRemaining: number;
  youmuBombDashStartX: number | undefined;
  youmuBombDashStartY: number | undefined;
  youmuBombDashAimX: number | undefined;
  youmuBombDashAimY: number | undefined;
}

export interface FighterExtraState
  extends MarisaExtraFighterState,
    ReisenExtraFighterState,
    YoumuExtraFighterState {}

export interface FighterExtensionState {
  invulnerableUntil: number;
  invulnerableDelayRemaining: number;
  invulnerableDelayDuration: number;
  deadUntil: number;
  actionLockedUntil: number;
  nonFireActionLockedUntil: number;
  switchLockedUntil: number;
  movementLockedUntil: number;
  projectilePauseUntil: number;
  timeStopUntil: number;
  fireCooldownUntil: number;
  bombCooldownUntil: number;
  flashUntil: number;
  statusVisibleUntil: number;
  grazedProjectileIds: readonly number[];
}

export interface FighterState
  extends FighterMetaState,
    FighterPositionState,
    FighterResourceState,
    FighterAmmoState,
    FighterCharacterState,
    FighterAbilityCardState,
    FighterStatsState,
    FighterExtraState,
    FighterExtensionState {}

export type PointRewardKind = "point" | "money" | "power";
export type CollectibleRewardSize = "small" | "medium" | "large";
export type PointPrefabId =
  | "point_small"
  | "point_medium"
  | "point_large"
  | "money_small"
  | "money_medium"
  | "money_large"
  | "power_small"
  | "power_medium"
  | "power_large";

export interface PointState {
  readonly id: number;
  readonly prefabId: PointPrefabId;
  readonly rewardKind: PointRewardKind;
  readonly rewardSize: CollectibleRewardSize;
  x: number;
  y: number;
  previousX: number;
  previousY: number;
  vx: number;
  vy: number;
  readonly size: number;
  readonly value: number;
  active: boolean;
  collectingBy: FighterKey | undefined;
  collectTicksRemaining: number;
}

export interface ProjectileState {
  readonly id: number;
  readonly kind: ProjectileKind;
  readonly owner: FighterKey;
  readonly sourceCharacterId?: CharacterDefinition["id"];
  readonly textureKey?: string;
  x: number;
  y: number;
  previousX: number;
  previousY: number;
  vx: number;
  vy: number;
  width: number;
  previousWidth: number;
  previousHeight: number;
  previousRenderHeight?: number;
  height: number;
  readonly centerOffsetX: number;
  readonly centerOffsetY: number;
  readonly renderWidth?: number;
  renderHeight?: number;
  readonly laserRenderMode?: LaserRenderMode;
  readonly laserVisualStyle?: LaserVisualStyle;
  readonly laserFramePairStartOffset?: number;
  readonly laserSpawnTicks?: number;
  readonly laserDespawnTicks?: number;
  readonly anchorX: number | undefined;
  readonly anchorY: number | undefined;
  visibleFrom: number;
  expireAt: number | undefined;
  damageFrom?: number;
  damageUntil?: number;
  homingStartAt: number;
  homingUntil: number;
  pausedUntil: number;
  retargetAt: number | undefined;
  retargetSpeed: number | undefined;
  retargetX: number | undefined;
  retargetY: number | undefined;
  retargetAimOwner: FighterKey | undefined;
  followAimOwner: FighterKey | undefined;
  followWhileActiveCharacterId: CharacterDefinition["id"] | undefined;
  followOwner: FighterKey | undefined;
  followOwnerDistance: number | undefined;
  followOwnerAngle: number | undefined;
  rollUntil: number;
  rollStartedAt: number;
  widthGrowthPerTick: number;
  maxWidth: number | undefined;
  heightGrowthPerTick: number;
  maxHeight: number | undefined;
  renderHeightGrowthPerTick: number;
  maxRenderHeight: number | undefined;
  readonly damage: number;
  angle: number;
  readonly couldClear: boolean;
  readonly clearsProjectiles: boolean;
  readonly piercesTargets: boolean;
  polarOriginX: number | undefined;
  polarOriginY: number | undefined;
  polarRadius: number | undefined;
  polarAngle: number | undefined;
  polarRadialSpeed: number | undefined;
  polarAngularSpeed: number | undefined;
  polarFollowOwner: FighterKey | undefined;
}

export interface EffectState {
  readonly id: number;
  readonly kind: "ring" | "burst" | "damage" | "shield";
  x: number;
  y: number;
  readonly tint: number;
  scale: number;
  readonly scalePerTick?: number;
  readonly expireAt: number;
  readonly text?: string;
  readonly width?: number;
  readonly height?: number;
  readonly angle?: number;
}

export interface ShieldState {
  readonly id: string;
  readonly owner: FighterKey;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly angle: number;
  readonly style?: "default" | "ufo_square";
  readonly spinAngle?: number;
}

export interface TrainingStats {
  shots: number;
  hits: number;
  bombUses: number;
  damage: number;
  elapsedTicks: number;
}

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

export interface ClearRingState {
  readonly id: number;
  readonly owner: FighterKey;
  x: number;
  y: number;
  previousX: number;
  previousY: number;
  readonly radius: number;
  readonly expireAt: number;
  readonly followsOwner: boolean;
}
