import {
  getAbilityCardDefinition,
  getCharacterDefinition,
} from "@repo/content";
import type { AbilityCardDefinition, CharacterDefinition } from "@repo/types";

export function getCharacter(
  id: CharacterDefinition["id"],
): CharacterDefinition {
  const character = getCharacterDefinition(id);
  if (!character) {
    throw new Error(`Unknown character id: ${id}`);
  }
  return character;
}

export function getAbilityCard(
  id: AbilityCardDefinition["id"],
): AbilityCardDefinition {
  const card = getAbilityCardDefinition(id);
  if (!card) {
    throw new Error(`Unknown ability card id: ${id}`);
  }
  return card;
}
