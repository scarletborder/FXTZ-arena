import { DEFAULT_ABILITY_CARDS, DEFAULT_CHARACTERS, type AbilityCardDefinition, type CharacterDefinition } from "@repo/content";

export function getCharacter(id: CharacterDefinition["id"]): CharacterDefinition {
  const character = DEFAULT_CHARACTERS.find((item) => item.id === id);
  if (!character) {
    throw new Error(`Unknown character id: ${id}`);
  }
  return character;
}

export function getAbilityCard(id: AbilityCardDefinition["id"]): AbilityCardDefinition {
  const card = DEFAULT_ABILITY_CARDS.find((item) => item.id === id);
  if (!card) {
    throw new Error(`Unknown ability card id: ${id}`);
  }
  return card;
}
