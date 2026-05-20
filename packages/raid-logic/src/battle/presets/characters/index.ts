import { ReimuBattleCharacter } from "./reimu";
import { MarisaBattleCharacter } from "./marisa";
import { SakuyaBattleCharacter } from "./sakuya";
import type { BattleCharacter } from "./base";

export type { BattleBulletSpawnParams, BattleCharacter, BattleLaserSpawnParams, CharacterActionContext } from "./base";

export function createBattleCharacter(characterId: BattleCharacter["id"]): BattleCharacter {
  if (characterId === "reimu") {
    return new ReimuBattleCharacter();
  }
  if (characterId === "marisa") {
    return new MarisaBattleCharacter();
  }
  if (characterId === "sakuya") {
    return new SakuyaBattleCharacter();
  }
  throw new Error(`Unknown battle character: ${characterId}`);
}
