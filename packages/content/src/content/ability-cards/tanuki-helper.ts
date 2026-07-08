import type { AbilityCardDefinition } from "./types";

import { BattleAbilityCard, type BattleHitContext } from "./base";
import { Vanilla } from "../decorators";

const TANUKI_HELPER_POWER_ON_HIT = 80;
const MAX_POWER = 300;

export class TanukiHelperBattleCard extends BattleAbilityCard {
  readonly id: AbilityCardDefinition["id"] = "tanuki_helper";
  readonly name = "content.ability_cards.tanuki_helper.name";
  readonly cost = 1;
  readonly kind = "passive" as AbilityCardDefinition["kind"];
  readonly useLimit: AbilityCardDefinition["useLimit"] = "infinite";
  readonly cooldownTicks = 0;
  readonly description = "content.ability_cards.tanuki_helper.description";
  readonly gallery: AbilityCardDefinition["gallery"] = {
    iconAsset: "assets/ability-cards/tanuki-helper/icon.png",
  };

  onHit(ctx: BattleHitContext): void {
    ctx.victim.pointCount = Math.min(
      MAX_POWER,
      ctx.victim.pointCount + TANUKI_HELPER_POWER_ON_HIT,
    );
  }
}

Vanilla.registerCard("tanuki_helper")(TanukiHelperBattleCard);
