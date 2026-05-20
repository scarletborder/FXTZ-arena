import { hitCircleUnits, secondsToTicks } from "@repo/types";
import type { AbilityCardDefinition } from "@repo/content";

import type { FighterState, ShieldState } from "../../types";
import { BattleAbilityCard, type BattleCardContext } from "./base";

export class SpiritStrikeBattleCard extends BattleAbilityCard {
  readonly id: AbilityCardDefinition["id"] = "spirit_strike_card";
  readonly name = "灵击符";
  readonly cost = 1;
  readonly kind = "active" as AbilityCardDefinition["kind"];
  readonly useLimit: AbilityCardDefinition["useLimit"] = 3;
  readonly cooldownTicks = secondsToTicks(20);
  readonly description = "清除周围 4 倍判定点圆圈直径范围内的全部弹幕。";
  readonly gallery: AbilityCardDefinition["gallery"] = {
    iconAsset: "assets/ability-cards/spirit-strike-card/icon.png",
    previewAsset: "assets/ability-cards/spirit-strike-card/preview.png",
  };

  onUse(ctx: BattleCardContext): void {
    const radius = hitCircleUnits(4);
    ctx.clearProjectilesAround({ x: ctx.self.x, y: ctx.self.y, radius });
    ctx.spawnClearRing({ x: ctx.self.x, y: ctx.self.y, radius, tint: 0x7ee39d, duration: 28 });
  }
}
