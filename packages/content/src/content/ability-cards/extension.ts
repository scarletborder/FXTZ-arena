import type { AbilityCardDefinition } from "./types";

import type { FighterState } from "../battle-types";
import { BattleAbilityCard } from "./base";
import { Vanilla } from "../decorators";

@Vanilla.RegisterCard("extension")
export class ExtensionBattleCard extends BattleAbilityCard {
  readonly id: AbilityCardDefinition["id"] = "extension";
  readonly name = "河城荷包";
  readonly cost = 2;
  readonly kind = "passive" as AbilityCardDefinition["kind"];
  readonly useLimit: AbilityCardDefinition["useLimit"] = "infinite";
  readonly cooldownTicks = 0;
  readonly description = "道具吸收范围小范围增加";
  readonly gallery: AbilityCardDefinition["gallery"] = {
    iconAsset: "assets/ability-cards/extension/icon.png",
    previewAsset: "assets/ability-cards/extension/preview.png",
  };

  getPointCollectRadiusBonus(_fighter: FighterState): number {
    return 32;
  }
}
