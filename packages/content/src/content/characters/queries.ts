import { characterLibrary } from "./character-library";
import type { CharacterDefinition } from "./types";

export function getCharacterDefinition(
  id: CharacterDefinition["id"],
): CharacterDefinition | undefined {
  if (characterLibrary.has(id)) {
    return characterLibrary.create(id).definition;
  }
  return undefined;
}

export function getAllCharacterDefinitions(): CharacterDefinition[] {
  return characterLibrary.ids().map((id) => characterLibrary.create(id).definition);
}
