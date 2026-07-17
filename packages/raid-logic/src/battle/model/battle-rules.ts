import type { BattleRoomMode } from "@repo/types";
import type { FighterKey } from "@repo/types";

export interface BattleRules {
  readonly mode: BattleRoomMode;
  canProjectileDamageTarget(owner: FighterKey, target: FighterKey): boolean;
  canProjectileGrazeTarget(owner: FighterKey, target: FighterKey): boolean;
  canProjectileClearProjectile(owner: FighterKey, target: FighterKey): boolean;
}

export function createBattleRules(mode: BattleRoomMode): BattleRules {
  return {
    mode,
    canProjectileDamageTarget: (owner, target) =>
      canProjectileDamageTarget(mode, owner, target),
    canProjectileGrazeTarget: (owner, target) =>
      canProjectileGrazeTarget(mode, owner, target),
    canProjectileClearProjectile: (owner, target) =>
      canProjectileClearProjectile(mode, owner, target),
  };
}

function canProjectileDamageTarget(
  mode: BattleRoomMode,
  owner: FighterKey,
  target: FighterKey,
): boolean {
  if (owner === target) {
    return false;
  }
  if (mode === "collaborate") {
    if (target === "Neutral") {
      return owner === "Player1" || owner === "Player2";
    }
    return owner === "Neutral";
  }
  return true;
}

function canProjectileGrazeTarget(
  mode: BattleRoomMode,
  owner: FighterKey,
  target: FighterKey,
): boolean {
  if (target === "Neutral") {
    return false;
  }
  return canProjectileDamageTarget(mode, owner, target);
}

function canProjectileClearProjectile(
  mode: BattleRoomMode,
  owner: FighterKey,
  target: FighterKey,
): boolean {
  if (owner === target) {
    return false;
  }
  if (mode === "collaborate") {
    return owner === "Neutral" || target === "Neutral";
  }
  return true;
}
