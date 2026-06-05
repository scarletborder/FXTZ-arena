import { secondsToTicks } from "../seconds-to-ticks";
import type { AbilityCardDefinition } from "./types";

import type { FighterState } from "../battle-types";
import { BattleAbilityCard, type BattleCardContext, type BattleHitContext, type BattleInitializeContext } from "./base";
import { Vanilla } from "../decorators";

export class MultiShotBattleCard extends BattleAbilityCard {
  readonly id: AbilityCardDefinition["id"] = "multi_shot";
  readonly name = "阴阳玉";
  readonly cost = 1;
  readonly kind = "passive" as AbilityCardDefinition["kind"];
  readonly useLimit: AbilityCardDefinition["useLimit"] = "infinite";
  readonly cooldownTicks = 0;
  readonly description = "为普通攻击额外追加低速诱导弹。";
  readonly gallery: AbilityCardDefinition["gallery"] = {
    iconAsset: "assets/ability-cards/multi-shot/icon.png",
  };

  onAfterFire(ctx: BattleCardContext): void {
    ctx.spawnBullet({
      owner: ctx.self.key,
      textureKey: "bullet_type_8_offset_0",
      kind: "orb",
      x: ctx.self.x,
      y: ctx.self.y,
      angle: ctx.self.facing,
      speedRank: "low",
      width: 8,
      height: 8,
      homingTicks: secondsToTicks(1.5),
      damage: 15,
      spawnOffset: 34,
    });
  }
}

Vanilla.registerCard("multi_shot")(MultiShotBattleCard);
