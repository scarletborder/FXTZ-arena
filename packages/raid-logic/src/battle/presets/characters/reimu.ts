import { fp } from "@shaisrc/fixed-point";

import type { CharacterDefinition, CharacterGalleryAssets } from "@repo/content";

import type { FighterState } from "../../types";
import type { BattleHitContext } from "../ability-cards";
import { BattleCharacter, hitCircleUnits, secondsToTicks, type CharacterActionContext } from "./base";
import { fpAtan2 } from "../../fp";
import { Vanilla } from "../../registry";

const CLEAR_RING_TICKS = secondsToTicks(2 / 3);

@Vanilla.RegisterCharacter("reimu")
export class ReimuBattleCharacter extends BattleCharacter {
  readonly id = "reimu" as CharacterDefinition["id"];
  readonly name = "博丽灵梦";
  readonly cost = 4;
  readonly roleClass = "suppress" as CharacterDefinition["roleClass"];
  readonly description = "低速诱导弹与清弹 bomb，适合压制弹幕空间。";
  readonly gallery: CharacterGalleryAssets = {
    portraitAsset: "assets/characters/reimu/portrait.png",
    attackPreviewAsset: "assets/characters/reimu/attack-preview.png",
  };
  readonly normalAttackId = "reimu_homing_shot";
  readonly bombId = "reimu_clear_bomb";
  readonly moveSpeed = "medium" as CharacterDefinition["moveSpeed"];
  readonly fireRate = "medium" as CharacterDefinition["fireRate"];
  readonly ammoCapacity = 5;
  readonly reloadTicksPerAmmo = secondsToTicks(0.8);
  readonly reloadStartPolicy = "keep_current" as CharacterDefinition["reloadStartPolicy"];
  readonly reloadCommitPolicy = "commit_per_ammo" as CharacterDefinition["reloadCommitPolicy"];

  shoot(ctx: CharacterActionContext, fighter: FighterState, aimX: number, aimY: number): void {
    const fpAngle = fp.fromFloat(this.aimAngle(fighter, aimX, aimY));
    const fpPI4 = fp.fromFloat(Math.PI / 4);
    for (const fpOffset of [fp.negate(fpPI4), fp.fromInt(0), fpPI4]) {
      const fpShotAngle = fp.add(fpAngle, fpOffset);
      this.spawnHomingOrb(ctx, fighter, fp.toFloat(fpShotAngle), secondsToTicks(2));
    }
  }

  useBomb(ctx: CharacterActionContext, fighter: FighterState): void {
    this.startBomb(ctx, fighter);
    this.setInvulnerable(fighter, secondsToTicks(2));
    const radius = this.clearProjectiles(ctx, fighter, 6);
    this.spawnClearRing(ctx, fighter, radius, 0xaec7ff, CLEAR_RING_TICKS);

    for (let index = 0; index < 12; index += 1) {
      const fpAngle = fp.mul(fp.div(fp.fromInt(index), fp.fromInt(12)), fp.mul(fp.fromFloat(Math.PI), fp.fromInt(2)));
      const fpCos = fp.cos(fpAngle);
      const fpSin = fp.sin(fpAngle);
      const x = fp.toFloat(fp.add(fp.fromFloat(fighter.x), fp.mul(fpCos, fp.fromFloat(radius))));
      const y = fp.toFloat(fp.add(fp.fromFloat(fighter.y), fp.mul(fpSin, fp.fromFloat(radius))));
      const shotAngle = fpAtan2(fp.fromFloat(ctx.opponent.y - y), fp.fromFloat(ctx.opponent.x - x));
      this.spawnHomingOrbAt(
        ctx,
        fighter,
        x,
        y,
        shotAngle,
        secondsToTicks(1.5),
      );
    }
  }

  onHit(_ctx: BattleHitContext): void {
    // Reimu has no hit-time modifier by default.
  }

  private spawnHomingOrb(ctx: CharacterActionContext, fighter: FighterState, angle: number, homingTicks: number): void {
    this.spawnHomingOrbAt(ctx, fighter, fighter.x, fighter.y, angle, homingTicks);
  }

  private spawnHomingOrbAt(
    ctx: CharacterActionContext,
    fighter: FighterState,
    x: number,
    y: number,
    angle: number,
    homingTicks: number,
  ): void {
    ctx.spawnBullet({
      owner: fighter.key,
      kind: "orb",
      x,
      y,
      angle,
      speedRank: "low",
      width: hitCircleUnits(2),
      height: hitCircleUnits(1),
      homingTicks,
      spawnOffset: 0,
    });
  }
}
