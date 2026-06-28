import type { AbilityCardDefinition } from "./types";
import { t } from "@repo/i18n";

import { BattleAbilityCard, type BattleInitializeContext } from "./base";
import { Vanilla } from "../decorators";

export class ExtraLifeBattleCard extends BattleAbilityCard {
  readonly id: AbilityCardDefinition["id"] = "extra_life";
  readonly name = t("content.ability_cards.extra_life.name");
  readonly cost = 3;
  readonly kind = "passive" as AbilityCardDefinition["kind"];
  readonly useLimit: AbilityCardDefinition["useLimit"] = "infinite";
  readonly cooldownTicks = 0;
  readonly description = t("content.ability_cards.extra_life.description");
  readonly gallery: AbilityCardDefinition["gallery"] = {
    iconAsset: "assets/ability-cards/extra-life/icon.png",
  };
  override readonly storyModeOverride = {
    onInitialize: (ctx: BattleInitializeContext): void => {
      ctx.self.lives += 1;
    },
  };

  onInitialize(ctx: BattleInitializeContext): void {
    ctx.self.lives += 1;
  }
}

Vanilla.registerCard("extra_life")(ExtraLifeBattleCard);
