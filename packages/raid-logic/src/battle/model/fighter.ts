import type { AbilityCardDefinition, CharacterDefinition } from "@repo/content";

import type { FighterKey, FighterState } from "../types";
import { getInitialBombs } from "../presets/ability-cards";

export function createFighter(
  key: FighterKey,
  primaryCharacter: CharacterDefinition,
  alternateCharacter: CharacterDefinition,
  x: number,
  y: number,
  activeCard: AbilityCardDefinition | undefined,
  cards: readonly AbilityCardDefinition[] = activeCard ? [activeCard] : [],
): FighterState {
  return {
    key,
    x,
    y,
    facing: 0,
    previousX: x,
    previousY: y,
    previousFacing: 0,
    lives: 2,
    bombs: getInitialBombs(cards),
    ammo: primaryCharacter.ammoCapacity,
    ammoDisplay: primaryCharacter.ammoCapacity,
    ammoCapacity: primaryCharacter.ammoCapacity,
    reloadRemaining: 0,
    reloadTotal: primaryCharacter.reloadTicksPerAmmo,
    reloadStartedAmmo: primaryCharacter.ammoCapacity,
    reloadCharacterId: undefined,
    invulnerableUntil: 0,
    invulnerableDelayRemaining: 0,
    invulnerableDelayDuration: 0,
    deadUntil: 0,
    actionLockedUntil: 0,
    nonFireActionLockedUntil: 0,
    movementLockedUntil: 0,
    projectilePauseUntil: 0,
    timeStopUntil: 0,
    moveSpeedOverride: undefined,
    moveSpeedOverrideUntil: 0,
    moveSpeedOverrideDelayRemaining: 0,
    pendingMoveSpeedOverride: undefined,
    pendingMoveSpeedOverrideDuration: 0,
    primaryCharacter,
    activeCharacter: primaryCharacter,
    alternateCharacter,
    activeCard,
    abilityCards: cards,
    activeCardUses: activeCard?.useLimit === "infinite" ? 999 : (activeCard?.useLimit ?? 0),
    activeCardCooldownUntil: 0,
    fireCooldownUntil: 0,
    bombCooldownUntil: 0,
    shotsFired: 0,
    hits: 0,
    damageTaken: 0,
    deaths: 0,
    bombUses: 0,
    flashUntil: 0,
    statusVisibleUntil: 0,
    ammoByCharacterId: createAmmoState(primaryCharacter, alternateCharacter),
  };
}

export function resetFighter(
  fighter: FighterState,
  primaryCharacter: CharacterDefinition,
  alternateCharacter: CharacterDefinition,
  x: number,
  y: number,
  activeCard: AbilityCardDefinition | undefined,
  cards: readonly AbilityCardDefinition[] = activeCard ? [activeCard] : [],
): void {
  const reset = createFighter(fighter.key, primaryCharacter, alternateCharacter, x, y, activeCard, cards);
  Object.assign(fighter, reset);
}

export function tickFighterTimers(fighter: FighterState): void {
  if (fighter.invulnerableUntil > 0) {
    fighter.invulnerableUntil -= 1;
  }
  if (fighter.invulnerableDelayRemaining > 0) {
    fighter.invulnerableDelayRemaining -= 1;
    if (fighter.invulnerableDelayRemaining === 0) {
      fighter.invulnerableUntil = Math.max(fighter.invulnerableUntil, fighter.invulnerableDelayDuration);
      fighter.invulnerableDelayDuration = 0;
    }
  }
  if (fighter.fireCooldownUntil > 0) {
    fighter.fireCooldownUntil -= 1;
  }
  if (fighter.bombCooldownUntil > 0) {
    fighter.bombCooldownUntil -= 1;
  }
  if (fighter.activeCardCooldownUntil > 0) {
    fighter.activeCardCooldownUntil -= 1;
  }
  if (fighter.actionLockedUntil > 0) {
    fighter.actionLockedUntil -= 1;
  }
  if (fighter.nonFireActionLockedUntil > 0) {
    fighter.nonFireActionLockedUntil -= 1;
  }
  if (fighter.movementLockedUntil > 0) {
    fighter.movementLockedUntil -= 1;
  }
  if (fighter.projectilePauseUntil > 0) {
    fighter.projectilePauseUntil -= 1;
  }
  if (fighter.timeStopUntil > 0) {
    fighter.timeStopUntil -= 1;
  }
  if (fighter.moveSpeedOverrideUntil > 0) {
    fighter.moveSpeedOverrideUntil -= 1;
    if (fighter.moveSpeedOverrideUntil === 0) {
      fighter.moveSpeedOverride = undefined;
    }
  }
  if (fighter.moveSpeedOverrideDelayRemaining > 0) {
    fighter.moveSpeedOverrideDelayRemaining -= 1;
    if (fighter.moveSpeedOverrideDelayRemaining === 0) {
      fighter.moveSpeedOverride = fighter.pendingMoveSpeedOverride;
      fighter.moveSpeedOverrideUntil = fighter.pendingMoveSpeedOverrideDuration;
      fighter.pendingMoveSpeedOverride = undefined;
      fighter.pendingMoveSpeedOverrideDuration = 0;
    }
  }
}

export function getCharacterAmmo(
  fighter: FighterState,
  character: CharacterDefinition,
): number {
  return fighter.ammoByCharacterId[character.id] ?? character.ammoCapacity;
}

export function setCharacterAmmo(
  fighter: FighterState,
  character: CharacterDefinition,
  ammo: number,
): void {
  fighter.ammoByCharacterId[character.id] = clamp(ammo, 0, character.ammoCapacity);
}

function createAmmoState(
  primaryCharacter: CharacterDefinition,
  alternateCharacter: CharacterDefinition,
): Record<string, number> {
  return {
    reimu: 0,
    marisa: 0,
    sakuya: 0,
    [primaryCharacter.id]: primaryCharacter.ammoCapacity,
    [alternateCharacter.id]: alternateCharacter.ammoCapacity,
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
