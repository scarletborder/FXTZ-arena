import { fp } from "@shaisrc/fixed-point";
import type { AbilityCardDefinition } from "./types";

import type { FighterState, ShieldState } from "../battle-types";
import { BattleAbilityCard, type BattleCardContext, type BattleHitContext, type BattleInitializeContext } from "./base";
import { Vanilla } from "../decorators";

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
    const fpFacing = fp.fromFloat(fighter.facing);
    const fpCos = fp.cos(fpFacing);
    const fpSin = fp.sin(fpFacing);
    const fpDist = fp.fromInt(distance);
    return [
      {
        owner: fighter.key,
        x: fp.toFloat(fp.sub(fp.fromFloat(fighter.x), fp.mul(fpCos, fpDist))),
        y: fp.toFloat(fp.sub(fp.fromFloat(fighter.y), fp.mul(fpSin, fpDist))),
        width: 34,
        height: 14,
        angle: fighter.facing,
      },
    ];
  }
}
