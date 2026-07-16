import type { AbilityCardDefinition } from "./types";

import { BattleAbilityCard, type BattleCardContext } from "./base";
import { ensureBackdoorFamiliar } from "./defensive-familiars";
import { Vanilla } from "../decorators";

export class BackdoorBattleCard extends BattleAbilityCard {
  readonly consumesAimOnPostUpdate = true;
  readonly id: AbilityCardDefinition["id"] = "backdoor";
  readonly name = "content.ability_cards.backdoor.name";
  readonly cost = 1;
  readonly kind = "passive" as AbilityCardDefinition["kind"];
  readonly useLimit: AbilityCardDefinition["useLimit"] = "infinite";
  readonly cooldownTicks = 0;
  readonly description = "content.ability_cards.backdoor.description";
  readonly gallery: AbilityCardDefinition["gallery"] = {
    iconAsset: "assets/ability-cards/backdoor/icon.png",
  };

  onPostUpdate(ctx: BattleCardContext): void {
    ensureBackdoorFamiliar(ctx, ctx.self);
  }
}

Vanilla.registerCard("backdoor")(BackdoorBattleCard);
