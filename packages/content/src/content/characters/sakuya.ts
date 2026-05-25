import { fp } from "@shaisrc/fixed-point";

import type { CharacterDefinition, CharacterGalleryAssets } from "./types";

import type { FighterState } from "../battle-types";
import type { BattleHitContext } from "../ability-cards/base";
import {
  BattleCharacter,
  DEFAULT_POINT_COLLECT_RADIUS,
  hitCircleUnits,
  secondsToTicks,
  type CharacterActionContext,
} from "./base";
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
  readonly reloadStartPolicy =
    "keep_current" as CharacterDefinition["reloadStartPolicy"];
  readonly reloadCommitPolicy =
    "commit_on_finish" as CharacterDefinition["reloadCommitPolicy"];
  readonly bulletSpeed = "medium" as CharacterDefinition["bulletSpeed"];
  readonly description = "平行双弹和时间停止 bomb，擅长近中距离压迫。";
  readonly gallery: CharacterGalleryAssets = {
    portraitAsset: "assets/characters/sakuya/portrait.png",
    attackPreviewAsset: "assets/characters/sakuya/attack-preview.png",
  };
  readonly normalAttackId = "sakuya_parallel_knives";
  readonly bombId = "sakuya_time_stop";
  readonly pointCollectRadius = DEFAULT_POINT_COLLECT_RADIUS;

  shoot(
    ctx: CharacterActionContext,
    fighter: FighterState,
    aimX: number,
    aimY: number,
  ): void {
    const angle = this.aimAngle(fighter, aimX, aimY);
    const fpAngle = fp.fromFloat(angle);
    const halfBulletGap = (8 + hitCircleUnits(1)) / 2;
    const fpPI2 = fp.fromFloat(Math.PI / 2);
    const fpSideX = fp.mul(
      fp.cos(fp.add(fpAngle, fpPI2)),
      fp.fromFloat(halfBulletGap),
    );
    const fpSideY = fp.mul(
      fp.sin(fp.add(fpAngle, fpPI2)),
      fp.fromFloat(halfBulletGap),
    );
    for (const side of [-1, 1]) {
      this.spawnKnife(
        ctx,
        fighter,
        fp.toFloat(
          fp.add(fp.fromFloat(fighter.x), fp.mul(fpSideX, fp.fromInt(side))),
        ),
        fp.toFloat(
          fp.add(fp.fromFloat(fighter.y), fp.mul(fpSideY, fp.fromInt(side))),
        ),
        fp.toFloat(fpAngle),
        "medium",
        undefined,
        {
          width: hitCircleUnits(3),
          height: hitCircleUnits(1),
        },
      );
    }

    const tier = this.pointPowerTier(fighter);
    if (tier >= 2) {
      const sideRepeats = tier >= 3 ? 4 : 2;
      for (let repeat = 0; repeat < sideRepeats; repeat += 1) {
        this.spawnSideKnives(ctx, fighter, repeat * 6);
      }
    }
    if (tier >= 4) {
      for (const side of [-1, 1]) {
        this.spawnKnife(
          ctx,
          fighter,
          fp.toFloat(
            fp.add(fp.fromFloat(fighter.x), fp.mul(fpSideX, fp.fromInt(side))),
          ),
          fp.toFloat(
            fp.add(fp.fromFloat(fighter.y), fp.mul(fpSideY, fp.fromInt(side))),
          ),
          fp.toFloat(fpAngle),
          "medium",
          undefined,
          {
            width: hitCircleUnits(3),
            height: hitCircleUnits(1),
          },
          ctx.frame + 6,
          10,
        );
      }
    }
  }

  useBomb(ctx: CharacterActionContext, fighter: FighterState): void {
    this.startBomb(ctx, fighter, secondsToTicks(1));
    const clearRingTicks = secondsToTicks(1);
    const radius = this.clearProjectiles(ctx, fighter, 32, clearRingTicks);
    this.spawnClearRing(ctx, fighter, radius, 0xb8c9ff, clearRingTicks);

    const freezeTicks = secondsToTicks(1);
    ctx.opponent.movementLockedUntil = Math.max(
      ctx.opponent.movementLockedUntil,
      freezeTicks,
    );
    ctx.opponent.actionLockedUntil = Math.max(
      ctx.opponent.actionLockedUntil,
      freezeTicks,
    );
    fighter.nonFireActionLockedUntil = Math.max(
      fighter.nonFireActionLockedUntil,
      freezeTicks,
    );
    fighter.projectilePauseUntil = Math.max(
      fighter.projectilePauseUntil,
      freezeTicks,
    );
    fighter.timeStopUntil = Math.max(fighter.timeStopUntil, freezeTicks);

    for (const projectile of ctx.projectiles) {
      projectile.pausedUntil = Math.max(
        projectile.pausedUntil,
        ctx.frame + freezeTicks,
      );
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
      this.spawnKnife(
        ctx,
        fighter,
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
    frame = ctx.frame,
    damage = 15,
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
      damage,
      spawnOffset: 0,
      frame,
      ...(pausedUntil === undefined ? {} : { pausedUntil }),
    });
  }

  private spawnSideKnives(
    ctx: CharacterActionContext,
    fighter: FighterState,
    frameDelay: number,
  ): void {
    const angle = this.angleToOpponent(ctx, fighter);
    const sideOffset = hitCircleUnits(3);
    for (const side of [-1, 1]) {
      const position = this.offsetPosition(
        fighter.x,
        fighter.y,
        fighter.facing,
        0,
        side * sideOffset,
      );
      this.spawnKnife(
        ctx,
        fighter,
        position.x,
        position.y,
        angle,
        "high",
        undefined,
        {
          width: hitCircleUnits(3),
          height: hitCircleUnits(1),
        },
        ctx.frame + frameDelay,
        10,
      );
    }
  }
}
