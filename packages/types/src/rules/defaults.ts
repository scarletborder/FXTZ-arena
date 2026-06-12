import { DEFAULT_BOMBS, DEFAULT_LIVES } from "../core";
import type { PlayerLoadout } from "../battle";

export function getInitialLives(loadout: PlayerLoadout): number {
  return loadout.abilityCardIds.includes("extra_life") ? DEFAULT_LIVES + 1 : DEFAULT_LIVES;
}

export function getDefaultBombs(loadout: PlayerLoadout): number {
  return loadout.abilityCardIds.includes("ember") ? DEFAULT_BOMBS + 1 : DEFAULT_BOMBS;
}
