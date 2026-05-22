import { fp } from "@shaisrc/fixed-point";

import type { CharacterDefinition, CharacterGalleryAssets } from "./types";

import type { FighterState } from "../battle-types";
import type { BattleHitContext } from "../ability-cards/base";
import { BattleCharacter, hitCircleUnits, secondsToTicks, type CharacterActionContext } from "./base";
import { fpAtan2 } from "../fp";
import { Vanilla } from "../decorators";

@Vanilla.RegisterCharacter("sakuya")
export class SakuyaBattleCharacter extends BattleCharacter {
  readonly id = "sakuya" as CharacterDefinition["id"];
  readonly name = "咲夜";
  readonly cost = 4;
  readonly roleClass = "assault" as CharacterDefinition["roleClass"];
  readonly moveSpeed = "medium" as CharacterDefinition["moveSpeed"];
  readonly fireRate = "medium" as CharacterDefinition["fireRate"];
  readonly ammoCapacity = 3;
  readonly reloadTicksPerAmmo = secondsToTicks(1);
  readonly reloadStartPolicy = "keep_current" as CharacterDefinition["reloadStartPolicy"];
  readonly reloadCommitPolicy = "commit_on_finish" as CharacterDefinition["reloadCommitPolicy"];
  readonly bulletSpeed = "medium" as CharacterDefinition["bulletSpeed"];
  readonly description = "平行双弹和时间停止 bomb，擅长近中距离压迫。";
  readonly gallery: CharacterGalleryAssets = {
    portraitAsset: "assets/characters/sakuya/portrait.png",
    attackPreviewAsset: "assets/characters/sakuya/attack-preview.png",
  };
  readonly normalAttackId = "sakuya_parallel_knives";
  readonly bombId = "sakuya_time_stop";

  shoot(ctx: CharacterActionContext, fighter: FighterState, aimX: number, aimY: number): void {
    const fpAngle = fp.fromFloat(this.aimAngle(fighter, aimX, aimY));
    const halfBulletGap = (8 + hitCircleUnits(1)) / 2;
    const fpPI2 = fp.fromFloat(Math.PI / 2);
    const fpSideX = fp.mul(fp.cos(fp.add(fpAngle, fpPI2)), fp.fromFloat(halfBulletGap));
    const fpSideY = fp.mul(fp.sin(fp.add(fpAngle, fpPI2)), fp.fromFloat(halfBulletGap));
    for (const side of [-1, 1]) {
      this.spawnKnife(ctx, fighter,
        fp.toFloat(fp.add(fp.fromFloat(fighter.x), fp.mul(fpSideX, fp.fromInt(side)))),
        fp.toFloat(fp.add(fp.fromFloat(fighter.y), fp.mul(fpSideY, fp.fromInt(side)))),
        fp.toFloat(fpAngle),
        "medium",
        undefined,
        {
          width: hitCircleUnits(3),
          height: hitCircleUnits(1),
        },
      );
    }
  }

  useBomb(ctx: CharacterActionContext, fighter: FighterState): void {
    this.startBomb(ctx, fighter, secondsToTicks(1));
    const radius = this.clearProjectiles(ctx, fighter, 8);
    this.spawnClearRing(ctx, fighter, radius, 0xb8c9ff, secondsToTicks(1));

    const freezeTicks = secondsToTicks(1);
    ctx.opponent.movementLockedUntil = Math.max(ctx.opponent.movementLockedUntil, freezeTicks);
    ctx.opponent.actionLockedUntil = Math.max(ctx.opponent.actionLockedUntil, freezeTicks);
    fighter.nonFireActionLockedUntil = Math.max(fighter.nonFireActionLockedUntil, freezeTicks);
    fighter.projectilePauseUntil = Math.max(fighter.projectilePauseUntil, freezeTicks);
    fighter.timeStopUntil = Math.max(fighter.timeStopUntil, freezeTicks);

    for (const projectile of ctx.projectiles) {
      projectile.pausedUntil = Math.max(projectile.pausedUntil, ctx.frame + freezeTicks);
    }

    const orbitRadius = hitCircleUnits(24);
    const fpOrbit = fp.fromFloat(orbitRadius);
    for (const angleRad of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) {
      const fpAngle = fp.fromFloat(angleRad);
      const fpCos = fp.cos(fpAngle);
      const fpSin = fp.sin(fpAngle);
      const fpX = fp.add(fp.fromFloat(ctx.opponent.x), fp.mul(fpCos, fpOrbit));
      const fpY = fp.add(fp.fromFloat(ctx.opponent.y), fp.mul(fpSin, fpOrbit));
      const fpShotAngle = fpAtan2(
        fp.sub(fp.fromFloat(ctx.opponent.y), fpY),
        fp.sub(fp.fromFloat(ctx.opponent.x), fpX),
      );
      this.spawnKnife(ctx, fighter,
        fp.toFloat(fpX),
        fp.toFloat(fpY),
        fpShotAngle,
        "medium",
        ctx.frame + freezeTicks,
        {
          width: hitCircleUnits(3),
          height: hitCircleUnits(1),
        },
      );
    }
  }

  onHit(_ctx: BattleHitContext): void {
    // Sakuya has no hit-time modifier by default.
  }

  private spawnKnife(
    ctx: CharacterActionContext,
    fighter: FighterState,
    x: number,
    y: number,
    angle: number,
    speedRank: "medium" | "high",
    pausedUntil: number | undefined,
    size: {
      readonly width: number;
      readonly height: number;
    },
  ): void {
    ctx.spawnBullet({
      owner: fighter.key,
      kind: "knife",
      x,
      y,
      angle,
      speedRank,
      width: size.width,
      height: size.height,
      homingTicks: 0,
      damage: 15,
      spawnOffset: 0,
      ...(pausedUntil === undefined ? {} : { pausedUntil }),
    });
  }
}
