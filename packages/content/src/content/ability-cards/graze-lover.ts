import type { AbilityCardDefinition } from "./types";

import type { FighterState } from "../battle-types";
import { BattleAbilityCard } from "./base";
import { Vanilla } from "../decorators";

@Vanilla.RegisterCard("graze_lover")
export class GrazeLoverBattleCard extends BattleAbilityCard {
  readonly id: AbilityCardDefinition["id"] = "graze_lover";
  readonly name = "擦弹爱好者";
  readonly cost = 1;
  readonly kind = "passive" as AbilityCardDefinition["kind"];
  readonly useLimit: AbilityCardDefinition["useLimit"] = "infinite";
  readonly cooldownTicks = 0;
  readonly description = "擦弹范围提升到 120%。";
  readonly gallery: AbilityCardDefinition["gallery"] = {
    iconAsset: "assets/ability-cards/graze_lover/icon.png",
    previewAsset: "assets/ability-cards/graze_lover/preview.png",
  };

  getGrazeRadiusMultiplier(_fighter: FighterState): number {
    return 1.2;
  }
}
