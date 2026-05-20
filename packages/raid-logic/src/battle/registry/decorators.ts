import { characterLibrary } from "./character-library";
import { cardLibrary } from "./card-library";
import { BattleCharacter } from "../presets/characters";
import { BattleAbilityCard } from "../presets/ability-cards";

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
