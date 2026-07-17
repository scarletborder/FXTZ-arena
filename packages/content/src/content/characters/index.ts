export * from "./queries";
export * from "./types";

export * from "./character-library";
export * from "./base";
export * from "./default-familiar";
export * from "./familiar-snapshot";
export type { CharacterActionContext } from "./base";

// Side-effect imports trigger @Vanilla.RegisterCharacter decorators
import "./reimu";
import "./marisa";
import "./shinki";
import "./sakuya";
import "./cirno";
import "./youmu";
import "./ellen";
export * from "./kaguya";
export * from "./reisen";
export * from "./flandre";
import "./yuyuko";
import "./yukari";
import "./flandre";
export * from "./iku";

import type { BattleCharacter } from "./base";
import { characterLibrary } from "./character-library";

export function createBattleCharacter(
  characterId: BattleCharacter["id"],
): BattleCharacter {
  return characterLibrary.create(characterId);
}
