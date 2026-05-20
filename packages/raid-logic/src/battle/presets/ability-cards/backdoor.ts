import type { AbilityCardDefinition } from "@repo/content";

import type { FighterState, ShieldState } from "../../types";
import { BattleAbilityCard } from "./base";
import { Vanilla } from "../../registry";

@Vanilla.RegisterCard("backdoor")
export class BackdoorBattleCard extends BattleAbilityCard {
  readonly id: AbilityCardDefinition["id"] = "backdoor";
  readonly name = "后门";
  readonly cost = 1;
  readonly kind = "passive" as AbilityCardDefinition["kind"];
  readonly useLimit: AbilityCardDefinition["useLimit"] = "infinite";
  readonly cooldownTicks = 0;
  readonly description = "角色后方追加可消除普通子弹的矩形护盾。";
  readonly gallery: AbilityCardDefinition["gallery"] = {
    iconAsset: "assets/ability-cards/backdoor/icon.png",
    previewAsset: "assets/ability-cards/backdoor/preview.png",
  };

  collectShields(fighter: FighterState): ShieldState[] {
    const distance = 28;
    return [
      {
        owner: fighter.key,
        x: fighter.x - Math.cos(fighter.facing) * distance,
        y: fighter.y - Math.sin(fighter.facing) * distance,
        width: 34,
        height: 14,
        angle: fighter.facing,
      },
    ];
  }
}
