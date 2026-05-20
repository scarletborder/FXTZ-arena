import type { CharacterDefinition, CharacterGalleryAssets } from "@repo/content";

import type { FighterState } from "../../types";
import type { BattleHitContext } from "../ability-cards";
import { BattleCharacter, hitCircleUnits, secondsToTicks, type CharacterActionContext } from "./base";
import { Vanilla } from "../../registry";

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
  readonly description = "平行双弹和时间停止 bomb，擅长近中距离压迫。";
  readonly gallery: CharacterGalleryAssets = {
    portraitAsset: "assets/characters/sakuya/portrait.png",
    attackPreviewAsset: "assets/characters/sakuya/attack-preview.png",
  };
  readonly normalAttackId = "sakuya_parallel_knives";
  readonly bombId = "sakuya_time_stop";

  shoot(ctx: CharacterActionContext, fighter: FighterState, aimX: number, aimY: number): void {
    const angle = this.aimAngle(fighter, aimX, aimY);
    const halfBulletGap = (8 + hitCircleUnits(1)) / 2;
    const sideX = Math.cos(angle + Math.PI / 2) * halfBulletGap;
    const sideY = Math.sin(angle + Math.PI / 2) * halfBulletGap;
    const pausedUntil = ctx.frame + fighter.projectilePauseUntil;
    for (const side of [-1, 1]) {
      this.spawnKnife(ctx, fighter, fighter.x + sideX * side, fighter.y + sideY * side, angle, "medium", pausedUntil, {
        width: hitCircleUnits(3),
        height: hitCircleUnits(1),
      });
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
    for (const angle of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) {
      const x = ctx.opponent.x + Math.cos(angle) * orbitRadius;
      const y = ctx.opponent.y + Math.sin(angle) * orbitRadius;
      const shotAngle = Math.atan2(ctx.opponent.y - y, ctx.opponent.x - x);
      this.spawnKnife(ctx, fighter, x, y, shotAngle, "medium", ctx.frame + freezeTicks, {
        width: hitCircleUnits(3),
        height: hitCircleUnits(1),
      });
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
    pausedUntil: number,
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
      spawnOffset: 0,
    });
    const projectile = ctx.projectiles[ctx.projectiles.length - 1];
    if (projectile) {
      projectile.pausedUntil = Math.max(projectile.pausedUntil, pausedUntil);
    }
  }
}
