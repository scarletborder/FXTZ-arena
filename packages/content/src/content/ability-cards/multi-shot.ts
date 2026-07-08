import { secondsToTicks } from "../seconds-to-ticks";
import type { AbilityCardDefinition } from "./types";

import type { FighterState } from "../battle-types";
import { BattleAbilityCard, type BattleCardContext, type BattleHitContext, type BattleInitializeContext } from "./base";
import { Vanilla } from "../decorators";

const MULTI_SHOT_WINGMAN_DISTANCE = 36;

export class MultiShotBattleCard extends BattleAbilityCard {
  readonly id: AbilityCardDefinition["id"] = "multi_shot";
  readonly name = "content.ability_cards.multi_shot.name";
  readonly cost = 1;
  readonly kind = "passive" as AbilityCardDefinition["kind"];
  readonly useLimit: AbilityCardDefinition["useLimit"] = "infinite";
  readonly cooldownTicks = 0;
  readonly description = "content.ability_cards.multi_shot.description";
  readonly gallery: AbilityCardDefinition["gallery"] = {
    iconAsset: "assets/ability-cards/multi-shot/icon.png",
  };

  onAfterFire(ctx: BattleCardContext): void {
    const wingmanX =
      ctx.self.x - Math.cos(ctx.self.facing) * MULTI_SHOT_WINGMAN_DISTANCE;
    const wingmanY =
      ctx.self.y - Math.sin(ctx.self.facing) * MULTI_SHOT_WINGMAN_DISTANCE;

    ctx.spawnBullet({
      owner: ctx.self.key,
      textureKey: "bullet_type_7_offset_0",
      kind: "orb",
      x: wingmanX,
      y: wingmanY,
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
