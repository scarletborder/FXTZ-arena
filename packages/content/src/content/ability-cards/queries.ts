import type { AbilityCardId } from "../ids";
import { DEFAULT_ABILITY_CARDS } from "./defaults";
import type { AbilityCardDefinition } from "./types";

export function getAbilityCardDefinition(
  id: AbilityCardId,
): AbilityCardDefinition | undefined {
  return DEFAULT_ABILITY_CARDS.find((card) => card.id === id);
}