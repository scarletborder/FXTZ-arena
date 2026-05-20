import type { AbilityCardDefinition } from "@repo/content";

import type { FighterState, ShieldState } from "../../types";
import { BattleAbilityCard, type BattleCardContext, type BattleHitContext, type BattleInitializeContext } from "./base";

export class ExtraLifeBattleCard extends BattleAbilityCard {
  readonly id: AbilityCardDefinition["id"] = "extra_life";
  readonly name = "余命";
  readonly cost = 3;
  readonly kind = "passive" as AbilityCardDefinition["kind"];
  readonly useLimit: AbilityCardDefinition["useLimit"] = "infinite";
  readonly cooldownTicks = 0;
  readonly description = "初始命数变为 3。";
  readonly gallery: AbilityCardDefinition["gallery"] = {
    iconAsset: "assets/ability-cards/extra-life/icon.png",
    previewAsset: "assets/ability-cards/extra-life/preview.png",
  };

  onInitialize(ctx: BattleInitializeContext): void {
    ctx.self.lives += 1;
  }
}
