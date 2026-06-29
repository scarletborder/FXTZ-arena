import { fp } from "@shaisrc/fixed-point";
import type { AbilityCardDefinition } from "./types";

import type { FighterState, ShieldState } from "../battle-types";
import { BattleAbilityCard, type BattleCardContext, type BattleHitContext, type BattleInitializeContext } from "./base";
import { Vanilla } from "../decorators";

export class BackdoorBattleCard extends BattleAbilityCard {
  readonly id: AbilityCardDefinition["id"] = "backdoor";
  readonly name = "content.ability_cards.backdoor.name";
  readonly cost = 1;
  readonly kind = "passive" as AbilityCardDefinition["kind"];
  readonly useLimit: AbilityCardDefinition["useLimit"] = "infinite";
  readonly cooldownTicks = 0;
  readonly description = "content.ability_cards.backdoor.description";
  readonly gallery: AbilityCardDefinition["gallery"] = {
    iconAsset: "assets/ability-cards/backdoor/icon.png",
  };

  collectShields(fighter: FighterState): ShieldState[] {
    const distance = 64;
    const fpFacing = fp.fromFloat(fighter.facing);
    const fpCos = fp.cos(fpFacing);
    const fpSin = fp.sin(fpFacing);
    const fpDist = fp.fromInt(distance);
    return [
      {
        owner: fighter.key,
        x: fp.toFloat(fp.sub(fp.fromFloat(fighter.x), fp.mul(fpCos, fpDist))),
        y: fp.toFloat(fp.sub(fp.fromFloat(fighter.y), fp.mul(fpSin, fpDist))),
        width: 7,
        height: 34,
        angle: fighter.facing,
      },
    ];
  }
}

Vanilla.registerCard("backdoor")(BackdoorBattleCard);
