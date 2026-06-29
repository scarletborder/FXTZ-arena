import type { AbilityCardDefinition } from "./types";

import type { FighterState } from "../battle-types";
import { BattleAbilityCard } from "./base";
import { Vanilla } from "../decorators";

export class GrazeLoverBattleCard extends BattleAbilityCard {
  readonly id: AbilityCardDefinition["id"] = "graze_lover";
  readonly name = "content.ability_cards.graze_lover.name";
  readonly cost = 1;
  readonly kind = "passive" as AbilityCardDefinition["kind"];
  readonly useLimit: AbilityCardDefinition["useLimit"] = "infinite";
  readonly cooldownTicks = 0;
  readonly description = "content.ability_cards.graze_lover.description";
  readonly gallery: AbilityCardDefinition["gallery"] = {
    iconAsset: "assets/ability-cards/graze_lover/icon.png",
  };

  getGrazeRadiusMultiplier(_fighter: FighterState): number {
    return 1.2;
  }
}

Vanilla.registerCard("graze_lover")(GrazeLoverBattleCard);
