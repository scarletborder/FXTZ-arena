import type { AbilityCardDefinition } from "./types";

import { secondsToTicks } from "../seconds-to-ticks";
import { BattleAbilityCard, type BattleCardContext } from "./base";
import { Vanilla } from "../decorators";

const INVISIBILITY_CLOTH_DURATION_TICKS = secondsToTicks(2);

export class InvisibilityClothBattleCard extends BattleAbilityCard {
  readonly id: AbilityCardDefinition["id"] = "invisibility_cloth";
  readonly name = "content.ability_cards.invisibility_cloth.name";
  readonly cost = 1;
  readonly kind = "active" as AbilityCardDefinition["kind"];
  readonly useLimit: AbilityCardDefinition["useLimit"] = 2;
  readonly cooldownTicks = secondsToTicks(16);
  readonly description = "content.ability_cards.invisibility_cloth.description";
  readonly gallery: AbilityCardDefinition["gallery"] = {
    iconAsset: "assets/ability-cards/invisibility-cloth/icon.png",
  };

  onUse(ctx: BattleCardContext): void {
    ctx.self.invulnerableUntil = Math.max(
      ctx.self.invulnerableUntil,
      INVISIBILITY_CLOTH_DURATION_TICKS,
    );
    ctx.self.actionLockedUntil = Math.max(
      ctx.self.actionLockedUntil,
      INVISIBILITY_CLOTH_DURATION_TICKS,
    );
    ctx.self.movementLockedUntil = Math.max(
      ctx.self.movementLockedUntil,
      INVISIBILITY_CLOTH_DURATION_TICKS,
    );
    ctx.self.switchLockedUntil = Math.max(
      ctx.self.switchLockedUntil,
      INVISIBILITY_CLOTH_DURATION_TICKS,
    );
  }
}

Vanilla.registerCard("invisibility_cloth")(InvisibilityClothBattleCard);
