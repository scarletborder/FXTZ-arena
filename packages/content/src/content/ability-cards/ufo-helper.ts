import type { AbilityCardDefinition } from "./types";

import { BattleAbilityCard, type BattleCardContext } from "./base";
import { ensureUfoHelperFamiliar } from "./defensive-familiars";
import { Vanilla } from "../decorators";

export class UfoHelperBattleCard extends BattleAbilityCard {
  readonly id: AbilityCardDefinition["id"] = "ufo_helper";
  readonly name = "content.ability_cards.ufo_helper.name";
  readonly cost = 1;
  readonly kind = "passive" as AbilityCardDefinition["kind"];
  readonly useLimit: AbilityCardDefinition["useLimit"] = "infinite";
  readonly cooldownTicks = 0;
  readonly description = "content.ability_cards.ufo_helper.description";
  readonly gallery: AbilityCardDefinition["gallery"] = {
    iconAsset: "assets/ability-cards/ufo-helper/icon.png",
  };

  onPostUpdate(ctx: BattleCardContext): void {
    ensureUfoHelperFamiliar(ctx, ctx.self);
  }
}

Vanilla.registerCard("ufo_helper")(UfoHelperBattleCard);
