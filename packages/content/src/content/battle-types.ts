import type { AbilityCardDefinition } from "./ability-cards/types";
import type { CharacterDefinition } from "./characters/types";
import type { PlayerId } from "@repo/types";

export type FighterKey = PlayerId;
export type ProjectileKind = "orb" | "knife" | "laser" | "spark";

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
  damageTaken: number;
  deaths: number;
  bombUses: number;
  flashUntil: number;
  statusVisibleUntil: number;
  ammoByCharacterId: Record<string, number>;
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
  readonly projectiles: readonly ProjectileState[];
  readonly effects: readonly EffectState[];
  readonly shields: readonly ShieldState[];
  readonly stats: TrainingStats;
}
