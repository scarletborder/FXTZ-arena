import { characterLibrary } from "../../registry";
import type { BattleCharacter } from "./base";

// Side-effect imports trigger @Vanilla.RegisterCharacter decorators
import "./reimu";
import "./marisa";
import "./sakuya";

export function createBattleCharacter(characterId: BattleCharacter["id"]): BattleCharacter {
  return characterLibrary.create(characterId);
}

export type { BattleBulletSpawnParams, BattleCharacter, BattleLaserSpawnParams, CharacterActionContext } from "./base";
