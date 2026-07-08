import type { AbilityCardDefinition } from "./types";

import {
  BattleAbilityCard,
  type BattleHitContext,
  type BattleInitializeContext,
} from "./base";
import { Vanilla } from "../decorators";

export class SakuraCharmBattleCard extends BattleAbilityCard {
  readonly id: AbilityCardDefinition["id"] = "sakura_charm";
  readonly name = "content.ability_cards.sakura_charm.name";
  readonly cost = 1;
  readonly kind = "passive" as AbilityCardDefinition["kind"];
  readonly useLimit: AbilityCardDefinition["useLimit"] = "infinite";
  readonly cooldownTicks = 0;
  readonly description = "content.ability_cards.sakura_charm.description";
  readonly gallery: AbilityCardDefinition["gallery"] = {
    iconAsset: "assets/ability-cards/sakura-charm/icon.png",
  };

  onInitialize(ctx: BattleInitializeContext): void {
    ctx.self.sakuraCharmGuardAvailable = true;
  }

  onHit(ctx: BattleHitContext): void {
    if (ctx.self.sakuraCharmGuardAvailable && ctx.resolution.lifeLoss > 0) {
      ctx.self.sakuraCharmGuardAvailable = false;
      ctx.resolution.lifeLoss = 0;
      return;
    }
    ctx.resolution.respawnBombDelta -= 1;
  }
}

Vanilla.registerCard("sakura_charm")(SakuraCharmBattleCard);
