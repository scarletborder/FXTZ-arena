export * from "./queries";
export * from "./types";

export * from "./character-library";
export * from "./base";
export type { CharacterActionContext } from "./base";

// Side-effect imports trigger @Vanilla.RegisterCharacter decorators
import "./reimu";
import "./marisa";
import "./sakuya";

import type { BattleCharacter } from "./base";
import { characterLibrary } from "./character-library";

export function createBattleCharacter(characterId: BattleCharacter["id"]): BattleCharacter {
  return characterLibrary.create(characterId);
}
