import type { AbilityCardDefinition } from "./types";

import type { FighterState } from "../battle-types";
import { BattleAbilityCard } from "./base";
import { Vanilla } from "../decorators";

export class GrazeLoverBattleCard extends BattleAbilityCard {
  readonly id: AbilityCardDefinition["id"] = "graze_lover";
  readonly name = "擦弹爱好者";
  readonly cost = 1;
  readonly kind = "passive" as AbilityCardDefinition["kind"];
  readonly useLimit: AbilityCardDefinition["useLimit"] = "infinite";
  readonly cooldownTicks = 0;
  readonly description = "擦弹判定范围提升";
  readonly gallery: AbilityCardDefinition["gallery"] = {
    iconAsset: "assets/ability-cards/graze_lover/icon.png",
  };

  getGrazeRadiusMultiplier(_fighter: FighterState): number {
    return 1.2;
  }
}

Vanilla.registerCard("graze_lover")(GrazeLoverBattleCard);
