import type { AbilityCardDefinition } from "./types";

import { secondsToTicks } from "../seconds-to-ticks";
import { BattleAbilityCard, type BattleCardContext, type BattleHitContext, type BattleInitializeContext } from "./base";
import { Vanilla } from "../decorators";
import { hitCircleUnits } from "../characters/base";

@Vanilla.RegisterCard("spirit_strike_card")
export class SpiritStrikeBattleCard extends BattleAbilityCard {
  readonly id: AbilityCardDefinition["id"] = "spirit_strike_card";
  readonly name = "灵击符";
  readonly cost = 1;
  readonly kind = "active" as AbilityCardDefinition["kind"];
  readonly useLimit: AbilityCardDefinition["useLimit"] = 3;
  readonly cooldownTicks = secondsToTicks(20);
  readonly description = "清除周围小范围的弹幕";
  readonly gallery: AbilityCardDefinition["gallery"] = {
    iconAsset: "assets/ability-cards/spirit-strike-card/icon.png",
    previewAsset: "assets/ability-cards/spirit-strike-card/preview.png",
  };

  onUse(ctx: BattleCardContext): void {
    const radius = hitCircleUnits(16);
    ctx.clearProjectilesAround({ x: ctx.self.x, y: ctx.self.y, radius });
    ctx.spawnClearRing({ x: ctx.self.x, y: ctx.self.y, radius, tint: 0x7ee39d, duration: 28 });
  }
}
