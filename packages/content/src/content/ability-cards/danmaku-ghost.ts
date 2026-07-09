import type { AbilityCardDefinition } from "./types";

import { BattleAbilityCard, type BattleGrazeContext } from "./base";
import { Vanilla } from "../decorators";

export class DanmakuGhostBattleCard extends BattleAbilityCard {
  readonly id: AbilityCardDefinition["id"] = "danmaku_ghost";
  readonly name = "content.ability_cards.danmaku_ghost.name";
  readonly cost = 2;
  readonly kind = "passive" as AbilityCardDefinition["kind"];
  readonly useLimit: AbilityCardDefinition["useLimit"] = "infinite";
  readonly cooldownTicks = 0;
  readonly description = "content.ability_cards.danmaku_ghost.description";
  readonly gallery: AbilityCardDefinition["gallery"] = {
    iconAsset: "assets/ability-cards/graze_lover/icon.png",
  };

  onGraze(ctx: BattleGrazeContext): boolean {
    return (
      ctx.owner !== "Neutral" &&
      ctx.projectile.couldClear &&
      ctx.random() < 0.2
    );
  }
}

Vanilla.registerCard("danmaku_ghost")(DanmakuGhostBattleCard);