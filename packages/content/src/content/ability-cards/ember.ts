import { DEFAULT_BOMBS } from "@repo/constants";
import type { AbilityCardDefinition } from "./types";

import type { FighterState } from "../battle-types";
import { BattleAbilityCard, type BattleCardContext, type BattleHitContext, type BattleInitializeContext } from "./base";
import { Vanilla } from "../decorators";

export class EmberBattleCard extends BattleAbilityCard {
  readonly id: AbilityCardDefinition["id"] = "ember";
  readonly name = "content.ability_cards.ember.name";
  readonly cost = 2;
  readonly kind = "passive" as AbilityCardDefinition["kind"];
  readonly useLimit: AbilityCardDefinition["useLimit"] = "infinite";
  readonly cooldownTicks = 0;
  readonly description = "content.ability_cards.ember.description";
  readonly gallery: AbilityCardDefinition["gallery"] = {
    iconAsset: "assets/ability-cards/ember/icon.png",
  };
  override readonly storyModeOverride = {
    onInitialize: (ctx: BattleInitializeContext): void => {
      ctx.self.bombs += 1;
      ctx.resolution.defaultBombs = ctx.self.bombs;
    },
    onHit: (): void => undefined,
  };

  onInitialize(ctx: BattleInitializeContext): void {
    ctx.resolution.defaultBombs = DEFAULT_BOMBS + 1;
  }

  onHit(ctx: BattleHitContext): void {
    ctx.resolution.defaultBombs = DEFAULT_BOMBS + 1;
  }
}

Vanilla.registerCard("ember")(EmberBattleCard);
