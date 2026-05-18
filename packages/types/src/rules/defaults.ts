import { DEFAULT_BOMBS, DEFAULT_LIVES } from "../core";
import type { PlayerLoadout } from "../battle";

export function getInitialLives(loadout: PlayerLoadout): number {
  return loadout.abilityCardIds.includes("extra_life") ? 3 : DEFAULT_LIVES;
}

export function getDefaultBombs(loadout: PlayerLoadout): number {
  return loadout.abilityCardIds.includes("ember") ? 4 : DEFAULT_BOMBS;
}
