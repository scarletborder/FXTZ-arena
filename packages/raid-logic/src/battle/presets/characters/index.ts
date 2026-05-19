import type { CharacterDefinition } from "@repo/content";

import { ReimuBattleCharacter } from "./reimu";
import { MarisaBattleCharacter } from "./marisa";
import { SakuyaBattleCharacter } from "./sakuya";
import type { BattleCharacter } from "./base";

export type { BattleBulletSpawnParams, BattleCharacter, BattleLaserSpawnParams, CharacterActionContext } from "./base";

export function createBattleCharacter(definition: CharacterDefinition): BattleCharacter {
  if (definition.id === "reimu") {
    return new ReimuBattleCharacter(definition);
  }
  if (definition.id === "marisa") {
    return new MarisaBattleCharacter(definition);
  }
  if (definition.id === "sakuya") {
    return new SakuyaBattleCharacter(definition);
  }
  throw new Error(`Unknown battle character: ${definition.id}`);
}
