import { fp } from "@shaisrc/fixed-point";

import type { CharacterDefinition, CharacterGalleryAssets } from "./types";
import { t } from "@repo/i18n";

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

const KNIFE_HIT_SIZE = 8;
const SAKUYA_KNIFE_TEXTURE = "bullet_type_20_offset_0";
const SAKUYA_BOMB_KNIFE_TEXTURE = "bullet_type_20_offset_1";
const SAKUYA_SNIPE_KNIFE_TEXTURE = "bullet_type_20_offset_2";
const SAKUYA_SIDE_KNIFE_TEXTURE = "bullet_type_20_offset_3";

const NORMALSHOOT_BASE_DAMAGE = 30;
const NORMALSHOOT_SNIPE_DAMAGE = 15;
const NORMALSHOOT_SIDE_DAMAGE_BY_TIER = {
  1: 10,
  2: 10,
  3: 10,
  4: 8,
} as const;
const BOMBSHOT_DAMAGE = 150;

export class SakuyaBattleCharacter extends BattleCharacter {
  readonly id = "sakuya" as CharacterDefinition["id"];
  readonly name = t("content.characters.sakuya.name");
  readonly cost = 4;
  readonly roleClass = "assault" as CharacterDefinition["roleClass"];
  readonly moveSpeed = "medium" as CharacterDefinition["moveSpeed"];
  readonly fireRate = "medium" as CharacterDefinition["fireRate"];
  readonly ammoCapacity = 3;
  readonly reloadTicksPerAmmo = secondsToTicks(0.9);
  readonly reloadStartPolicy =
    "keep_current" as CharacterDefinition["reloadStartPolicy"];
  readonly reloadCommitPolicy =
    "commit_on_finish" as CharacterDefinition["reloadCommitPolicy"];
  readonly bulletSpeed = "medium" as CharacterDefinition["bulletSpeed"];
  readonly description = t("content.characters.sakuya.description");
  readonly gallery: CharacterGalleryAssets = {
    portraitAsset: "assets/characters/sakuya/portrait.png",
    attackPreviewAsset: "assets/characters/sakuya/preview.png",
    combatAsset: "assets/characters/sakuya/combat.png",
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
          width: KNIFE_HIT_SIZE,
          height: KNIFE_HIT_SIZE,
        },
        undefined,
        NORMALSHOOT_BASE_DAMAGE,
      );
    }

    const tier = this.pointPowerTier(fighter);
    if (tier >= 1) {
      this.spawnSnipeKnife(ctx, fighter, aimX, aimY, 0);
    }
    if (tier >= 2) {
      this.spawnSnipeKnife(ctx, fighter, aimX, aimY, 8);
      this.spawnSideKnives(
        ctx,
        fighter,
        0,
        2,
        NORMALSHOOT_SIDE_DAMAGE_BY_TIER[tier],
        "high",
      );
    }
    if (tier >= 3) {
      this.spawnSnipeKnife(ctx, fighter, aimX, aimY, 16);
    }
    if (tier >= 4) {
      this.spawnSnipeKnife(ctx, fighter, aimX, aimY, 24);
      this.spawnSideKnives(
        ctx,
        fighter,
        8,
        2,
        NORMALSHOOT_SIDE_DAMAGE_BY_TIER[tier],
        "high",
      );
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
      ctx.pauseProjectileTimeline(projectile, freezeTicks);
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
          width: KNIFE_HIT_SIZE,
          height: KNIFE_HIT_SIZE,
        },
        undefined,
        BOMBSHOT_DAMAGE,
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
    textureKey =
      pausedUntil === undefined
        ? SAKUYA_KNIFE_TEXTURE
        : SAKUYA_BOMB_KNIFE_TEXTURE,
  ): void {
    ctx.spawnBullet({
      owner: fighter.key,
      textureKey,
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
    countPerSide = 1,
    damage = 10,
    speedRank: "medium" | "high" = "medium",
  ): void {
    const sideOffset = hitCircleUnits(3);
    const halfGap = (8 + hitCircleUnits(1)) / 2;
    for (const side of [-1, 1]) {
      const basePosition = this.offsetPosition(
        fighter.x,
        fighter.y,
        fighter.facing,
        0,
        side * sideOffset,
      );
      const knifeAngle = fighter.facing + side * (Math.PI / 6);
      const perpAngle = knifeAngle + Math.PI / 2;
      const fpPerp = fp.fromFloat(perpAngle);
      const perpCos = fp.toFloat(fp.cos(fpPerp));
      const perpSin = fp.toFloat(fp.sin(fpPerp));
      for (let i = 0; i < countPerSide; i++) {
        const offset = (i - (countPerSide - 1) / 2) * halfGap;
        this.spawnKnife(
          ctx,
          fighter,
          basePosition.x + perpCos * offset,
          basePosition.y + perpSin * offset,
          knifeAngle,
          speedRank,
          undefined,
          {
            width: KNIFE_HIT_SIZE,
            height: KNIFE_HIT_SIZE,
          },
          ctx.frame + frameDelay,
          damage,
          SAKUYA_SIDE_KNIFE_TEXTURE,
        );
      }
    }
  }

  private spawnCenterKnives(
    ctx: CharacterActionContext,
    fighter: FighterState,
    frameDelay: number,
    damage = 10,
    speedRank: "medium" | "high" = "medium",
  ): void {
    const angle = this.angleToOpponent(ctx, fighter);
    const halfBulletGap = (8 + hitCircleUnits(1)) / 2;
    const fpAngle = fp.fromFloat(angle);
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
        angle,
        speedRank,
        undefined,
        {
          width: KNIFE_HIT_SIZE,
          height: KNIFE_HIT_SIZE,
        },
        ctx.frame + frameDelay,
        damage,
      );
    }
  }

  private spawnSnipeKnife(
    ctx: CharacterActionContext,
    fighter: FighterState,
    aimX: number,
    aimY: number,
    frameDelay: number,
  ): void {
    const angle = this.angleToNearestEnemyTarget(ctx, fighter, aimX, aimY);
    this.spawnKnife(
      ctx,
      fighter,
      fighter.x,
      fighter.y,
      angle,
      "high",
      undefined,
      {
        width: KNIFE_HIT_SIZE,
        height: KNIFE_HIT_SIZE,
      },
      ctx.frame + frameDelay,
      NORMALSHOOT_SNIPE_DAMAGE,
      SAKUYA_SNIPE_KNIFE_TEXTURE,
    );
  }

  private angleToNearestEnemyTarget(
    ctx: CharacterActionContext,
    fighter: FighterState,
    aimX: number,
    aimY: number,
  ): number {
    ctx.consumeAim?.();
    let best: { readonly x: number; readonly y: number; readonly mobId?: number } | undefined;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const target of ctx.enemyTargets ?? []) {
      const distance = (target.x - aimX) ** 2 + (target.y - aimY) ** 2;
      if (
        distance < bestDistance ||
        (distance === bestDistance && (target.mobId ?? 0) < (best?.mobId ?? 0))
      ) {
        best = target;
        bestDistance = distance;
      }
    }

    if (!best) {
      return this.angleToOpponent(ctx, fighter);
    }
    return fpAtan2(
      fp.fromFloat(best.y - fighter.y),
      fp.fromFloat(best.x - fighter.x),
    );
  }
}

Vanilla.registerCharacter("sakuya")(SakuyaBattleCharacter);
