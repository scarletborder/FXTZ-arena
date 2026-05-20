import { getAbilityCardDefinition, getCharacterDefinition, type AbilityCardDefinition, type CharacterDefinition } from "@repo/content";

export function getCharacter(id: CharacterDefinition["id"]): CharacterDefinition {
  const character = getCharacterDefinition(id);
  if (!character) {
    throw new Error(`Unknown character id: ${id}`);
  }
  return character;
}

export function getAbilityCard(id: AbilityCardDefinition["id"]): AbilityCardDefinition {
  const card = getAbilityCardDefinition(id);
  if (!card) {
    throw new Error(`Unknown ability card id: ${id}`);
  }
  return card;
}
