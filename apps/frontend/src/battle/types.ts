import type { AbilityCardDefinition, CharacterDefinition } from "@repo/content";

export type FighterKey = "player" | "target";
export type ProjectileKind = "orb" | "knife" | "laser" | "spark";

export interface BattleInputState {
  readonly moveX: -1 | 0 | 1;
  readonly moveY: -1 | 0 | 1;
  readonly aimX: number;
  readonly aimY: number;
  readonly shootPressed: boolean;
  readonly bombPressed: boolean;
  readonly activeCardPressed: boolean;
  readonly reloadPressed: boolean;
  readonly alternateHeld: boolean;
  readonly infoHeld: boolean;
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
  activeCardUses: number;
  activeCardCooldownUntil: number;
  fireCooldownUntil: number;
  bombCooldownUntil: number;
  shotsFired: number;
  hits: number;
  damageTaken: number;
  deaths: number;
  bombUses: number;
  flashUntil: number;
  statusVisibleUntil: number;
  ammoByCharacterId: Record<CharacterDefinition["id"], number>;
}

export interface ProjectileState {
  readonly id: number;
  readonly kind: ProjectileKind;
  readonly owner: FighterKey;
  x: number;
  y: number;
  previousX: number;
  previousY: number;
  vx: number;
  vy: number;
  width: number;
  previousWidth: number;
  readonly height: number;
  readonly anchorX: number | undefined;
  readonly anchorY: number | undefined;
  readonly visibleFrom: number;
  readonly expireAt: number | undefined;
  readonly homingStartAt: number;
  homingUntil: number;
  pausedUntil: number;
  widthGrowthPerTick: number;
  maxWidth: number | undefined;
  readonly damage: number;
  readonly pierce: boolean;
  angle: number;
}

export interface EffectState {
  readonly id: number;
  readonly kind: "ring" | "burst" | "damage";
  x: number;
  y: number;
  readonly tint: number;
  readonly scale: number;
  readonly expireAt: number;
  readonly text?: string;
}

export interface TrainingStats {
  shots: number;
  hits: number;
  bombUses: number;
  damage: number;
  elapsedTicks: number;
}
