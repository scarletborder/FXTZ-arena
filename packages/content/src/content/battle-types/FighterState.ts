import type { AbilityCardDefinition } from "../ability-cards/types";
import type { CharacterDefinition } from "../characters/types";
import type { FighterKey } from "./common";

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
}

export interface FighterStatsState {
  shotsFired: number;
  hits: number;
  hitsTaken: number;
  damageTaken: number;
  deaths: number;
  bombUses: number;
}

export interface ReimuExtraFighterState {}

export interface MarisaExtraFighterState {
  moveSpeedOverride: CharacterDefinition["moveSpeed"] | undefined;
  moveSpeedOverrideUntil: number;
  moveSpeedOverrideDelayRemaining: number;
  pendingMoveSpeedOverride: CharacterDefinition["moveSpeed"] | undefined;
  pendingMoveSpeedOverrideDuration: number;
}

export interface SakuyaExtraFighterState {}

export interface CirnoExtraFighterState {}

export interface EllenExtraFighterState {}

export interface KaguyaExtraFighterState {}

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

export interface YuyukoExtraFighterState {}

export interface YukariExtraFighterState {}

export interface FlandreExtraFighterState {}

export interface FighterExtraState
  extends ReimuExtraFighterState,
    MarisaExtraFighterState,
    SakuyaExtraFighterState,
    CirnoExtraFighterState,
    EllenExtraFighterState,
    KaguyaExtraFighterState,
    ReisenExtraFighterState,
    YoumuExtraFighterState,
    YuyukoExtraFighterState,
    YukariExtraFighterState,
    FlandreExtraFighterState {}

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
