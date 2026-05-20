import { secondsToTicks } from "@repo/types";
import type { AbilityCardDefinition } from "@repo/content";

import type { FighterState, ShieldState } from "../../types";
import { BattleAbilityCard, type BattleCardContext } from "./base";

export class MultiShotBattleCard extends BattleAbilityCard {
  readonly id: AbilityCardDefinition["id"] = "multi_shot";
  readonly name = "多射";
  readonly cost = 1;
  readonly kind = "passive" as AbilityCardDefinition["kind"];
  readonly useLimit: AbilityCardDefinition["useLimit"] = "infinite";
  readonly cooldownTicks = 0;
  readonly description = "每次左键发射时，额外追加 1 个低速诱导普通矩形子弹。";
  readonly gallery: AbilityCardDefinition["gallery"] = {
    iconAsset: "assets/ability-cards/multi-shot/icon.png",
    previewAsset: "assets/ability-cards/multi-shot/preview.png",
  };

  onAfterFire(ctx: BattleCardContext): void {
    ctx.spawnBullet({
      owner: ctx.self.key,
      kind: "orb",
      x: ctx.self.x,
      y: ctx.self.y,
      angle: ctx.self.facing,
      speedRank: "low",
      width: 18,
      height: 10,
      homingTicks: secondsToTicks(1.5),
      spawnOffset: 34,
    });
  }
}
