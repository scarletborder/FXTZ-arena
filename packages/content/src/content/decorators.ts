import { characterLibrary } from "./characters/character-library";
import { cardLibrary } from "./ability-cards/card-library";
import type { BattleCharacter } from "./characters/base";
import type { BattleAbilityCard } from "./ability-cards/base";

export const Vanilla = {
  registerCharacter(id: string) {
    return (target: new () => BattleCharacter): void => {
      characterLibrary.register(id, target);
    };
  },
  registerCard(id: string) {
    return (target: new () => BattleAbilityCard): void => {
      cardLibrary.register(id, target);
    };
  },
};
