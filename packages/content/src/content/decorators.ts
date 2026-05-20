import { characterLibrary } from "./characters/character-library";
import { cardLibrary } from "./ability-cards/card-library";
import type { BattleCharacter } from "./characters/base";
import type { BattleAbilityCard } from "./ability-cards/base";

export const Vanilla = {
  RegisterCharacter(id: string) {
    return (target: new () => BattleCharacter, _context: any): void => {
      characterLibrary.register(id, target);
    };
  },
  RegisterCard(id: string) {
    return (target: new () => BattleAbilityCard, _context: any): void => {
      cardLibrary.register(id, target);
    };
  },
};
