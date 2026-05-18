import type { CharacterId } from "../ids";
import { DEFAULT_CHARACTERS } from "./defaults";
import type { CharacterDefinition } from "./types";

export function getCharacterDefinition(
  id: CharacterId,
): CharacterDefinition | undefined {
  return DEFAULT_CHARACTERS.find((character) => character.id === id);
}