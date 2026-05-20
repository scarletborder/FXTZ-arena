import type { AbilityCardId } from "../ids";
import { cardLibrary } from "./card-library";
import type { AbilityCardDefinition } from "./types";

export function getAbilityCardDefinition(
  id: AbilityCardId,
): AbilityCardDefinition | undefined {
  if (cardLibrary.has(id)) {
    return cardLibrary.create(id).definition;
  }
  return undefined;
}

export function getAllAbilityCardDefinitions(): AbilityCardDefinition[] {
  return cardLibrary.ids().map((id) => cardLibrary.create(id).definition);
}
