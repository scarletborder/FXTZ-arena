import type { AbilityCardDefinition } from "./types";
import { t } from "@repo/i18n";

import type { FighterState } from "../battle-types";
import { BattleAbilityCard } from "./base";
import { Vanilla } from "../decorators";

export class ExtensionBattleCard extends BattleAbilityCard {
  readonly id: AbilityCardDefinition["id"] = "extension";
  readonly name = t("content.ability_cards.extension.name");
  readonly cost = 2;
  readonly kind = "passive" as AbilityCardDefinition["kind"];
  readonly useLimit: AbilityCardDefinition["useLimit"] = "infinite";
  readonly cooldownTicks = 0;
  readonly description = t("content.ability_cards.extension.description");
  readonly gallery: AbilityCardDefinition["gallery"] = {
    iconAsset: "assets/ability-cards/extension/icon.png",
  };

  getPointCollectRadiusBonus(_fighter: FighterState): number {
    return 32;
  }
}

Vanilla.registerCard("extension")(ExtensionBattleCard);
