import type { AbilityCardDefinition } from "./types";

import { BattleAbilityCard, type BattleInitializeContext } from "./base";
import { Vanilla } from "../decorators";

export class ExtraLifeBattleCard extends BattleAbilityCard {
  readonly id: AbilityCardDefinition["id"] = "extra_life";
  readonly name = "生命卡牌";
  readonly cost = 3;
  readonly kind = "passive" as AbilityCardDefinition["kind"];
  readonly useLimit: AbilityCardDefinition["useLimit"] = "infinite";
  readonly cooldownTicks = 0;
  readonly description = "初始命数增加1";
  readonly gallery: AbilityCardDefinition["gallery"] = {
    iconAsset: "assets/ability-cards/extra-life/icon.png",
  };

  onInitialize(ctx: BattleInitializeContext): void {
    ctx.self.lives += 1;
  }
}

Vanilla.registerCard("extra_life")(ExtraLifeBattleCard);
