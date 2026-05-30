import type { AbilityCardDefinition } from "./ability-cards/types";
import type { CharacterDefinition } from "./characters/types";
import type { BattlePlayerId, NeutralMobState } from "@repo/types";

export type FighterKey = BattlePlayerId;
export type ProjectileKind = "orb" | "knife" | "diamond" | "laser" | "spark";

export interface ShieldState {
  readonly owner: FighterKey;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly angle: number;
}

export interface FighterState {
  readonly key: FighterKey;
  x: number;
  y: number;
  facing: number;
  previousX: number;
  previousY: number;
  previousFacing: number;
  lives: number;
  bombs: number;
  pointCount: number;
  ammo: number;
  ammoDisplay: number;
  ammoCapacity: number;
  reloadRemaining: number;
  reloadTotal: number;
  reloadStartedAmmo: number;
  reloadCharacterId: CharacterDefinition["id"] | undefined;
  invulnerableUntil: number;
  invulnerableDelayRemaining: number;
  invulnerableDelayDuration: number;
  deadUntil: number;
  actionLockedUntil: number;
  nonFireActionLockedUntil: number;
  movementLockedUntil: number;
  projectilePauseUntil: number;
  timeStopUntil: number;
  moveSpeedOverride: CharacterDefinition["moveSpeed"] | undefined;
  moveSpeedOverrideUntil: number;
  moveSpeedOverrideDelayRemaining: number;
  pendingMoveSpeedOverride: CharacterDefinition["moveSpeed"] | undefined;
  pendingMoveSpeedOverrideDuration: number;
  primaryCharacter: CharacterDefinition;
  activeCharacter: CharacterDefinition;
  alternateCharacter: CharacterDefinition;
  activeCard: AbilityCardDefinition | undefined;
  abilityCards: readonly AbilityCardDefinition[];
  activeCardUses: number;
  activeCardCooldownUntil: number;
  fireCooldownUntil: number;
  bombCooldownUntil: number;
  shotsFired: number;
  hits: number;
  hitsTaken: number;
  damageTaken: number;
  deaths: number;
  bombUses: number;
  flashUntil: number;
  statusVisibleUntil: number;
  ammoByCharacterId: Record<string, number>;
  grazedProjectileIds: readonly number[];
}

export type PointPrefabId = "point_small" | "point_medium" | "point_large";

export interface PointState {
  readonly id: number;
  readonly prefabId: PointPrefabId;
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
  readonly textureKey?: string;
  x: number;
  y: number;
  previousX: number;
  previousY: number;
  vx: number;
  vy: number;
  width: number;
  previousWidth: number;
  readonly height: number;
  readonly renderHeight?: number;
  readonly anchorX: number | undefined;
  readonly anchorY: number | undefined;
  visibleFrom: number;
  expireAt: number | undefined;
  homingStartAt: number;
  homingUntil: number;
  pausedUntil: number;
  retargetAt: number | undefined;
  retargetSpeed: number | undefined;
  widthGrowthPerTick: number;
  maxWidth: number | undefined;
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
}

export interface EffectState {
  readonly id: number;
  readonly kind: "ring" | "burst" | "damage" | "shield";
  x: number;
  y: number;
  readonly tint: number;
  readonly scale: number;
  readonly expireAt: number;
  readonly text?: string;
  readonly width?: number;
  readonly height?: number;
  readonly angle?: number;
}

export interface TrainingStats {
  shots: number;
  hits: number;
  bombUses: number;
  damage: number;
  elapsedTicks: number;
}

export interface BattleOutputState {
  readonly frame: number;
  readonly gameOver: boolean;
  readonly player: FighterState;
  readonly target: FighterState;
  readonly points: readonly PointState[];
  readonly neutralMobs: readonly NeutralMobState[];
  readonly projectiles: readonly ProjectileState[];
  readonly effects: readonly EffectState[];
  readonly shields: readonly ShieldState[];
  readonly stats: TrainingStats;
}
