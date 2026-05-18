import type { CharacterDefinition } from "@repo/content";

import type { FighterState } from "../../types";
import { BattleCharacter, hitCircleUnits, secondsToTicks, type CharacterActionContext } from "./base";

export class SakuyaBattleCharacter extends BattleCharacter {
  constructor(definition: CharacterDefinition) {
    super(definition);
  }

  readonly moveSpeed = this.definition.moveSpeed;
  readonly fireRate = this.definition.fireRate;
  readonly ammoCapacity = this.definition.ammoCapacity;
  readonly reloadTicksPerAmmo = this.definition.reloadTicksPerAmmo;
  override readonly reloadPolicy = "keep_until_full";

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

  useActiveCard(ctx: CharacterActionContext, fighter: FighterState): void {
    this.useSpiritStrike(ctx, fighter, 0xb8c9ff);
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
    ctx.projectileSystem.spawnBullet(ctx.projectiles, {
      owner: fighter.key,
      kind: "knife",
      x,
      y,
      angle,
      speedRank,
      width: size.width,
      height: size.height,
      frame: ctx.frame,
      homingTicks: 0,
      spawnOffset: 0,
    });
    const projectile = ctx.projectiles[ctx.projectiles.length - 1];
    if (projectile) {
      projectile.pausedUntil = Math.max(projectile.pausedUntil, pausedUntil);
    }
  }
}
