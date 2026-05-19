import type { CharacterDefinition } from "@repo/content";

import type { FighterState } from "../../types";
import type { BattleHitContext } from "../ability-cards";
import { BattleCharacter, hitCircleUnits, secondsToTicks, type CharacterActionContext } from "./base";

export class MarisaBattleCharacter extends BattleCharacter {
  constructor(definition: CharacterDefinition) {
    super(definition);
  }

  readonly moveSpeed = this.definition.moveSpeed;
  readonly fireRate = this.definition.fireRate;
  readonly ammoCapacity = this.definition.ammoCapacity;
  readonly reloadTicksPerAmmo = this.definition.reloadTicksPerAmmo;

  shoot(ctx: CharacterActionContext, fighter: FighterState, aimX: number, aimY: number): void {
    ctx.projectileSystem.spawnLaser(ctx.projectiles, {
      owner: fighter.key,
      x: fighter.x,
      y: fighter.y,
      angle: this.aimAngle(fighter, aimX, aimY),
      frame: ctx.frame,
      height: hitCircleUnits(3),
      initialLength: hitCircleUnits(3),
      maxLength: hitCircleUnits(16),
      lengthGrowthPerTick: hitCircleUnits(1),
      speedRank: "high",
    });
  }

  useBomb(ctx: CharacterActionContext, fighter: FighterState): void {
    this.startBomb(ctx, fighter, secondsToTicks(4));
    const radius = this.clearProjectiles(ctx, fighter, 8);
    this.spawnClearRing(ctx, fighter, radius, 0xff6b6b, secondsToTicks(1));

    const windupTicks = secondsToTicks(1);
    const durationTicks = secondsToTicks(3);
    const totalTicks = windupTicks + durationTicks;
    const angle = fighter.facing;
    fighter.actionLockedUntil = Math.max(fighter.actionLockedUntil, totalTicks);
    fighter.moveSpeedOverrideDelayRemaining = windupTicks;
    fighter.pendingMoveSpeedOverride = "low";
    fighter.pendingMoveSpeedOverrideDuration = durationTicks;

    ctx.projectileSystem.spawnLaser(ctx.projectiles, {
      owner: fighter.key,
      x: fighter.x,
      y: fighter.y,
      angle,
      frame: ctx.frame,
      height: hitCircleUnits(1.5),
      initialLength: Number.POSITIVE_INFINITY,
      maxLength: Number.POSITIVE_INFINITY,
      lengthGrowthPerTick: 0,
      speedRank: "low",
      expireTicks: windupTicks,
      damage: 0,
      spawnOffset: 0,
      pinned: true,
      anchored: true,
      rayLike: true,
    });

    ctx.projectileSystem.spawnLaser(ctx.projectiles, {
      owner: fighter.key,
      kind: "spark",
      x: fighter.x,
      y: fighter.y,
      angle,
      frame: ctx.frame,
      height: hitCircleUnits(36),
      initialLength: Number.POSITIVE_INFINITY,
      maxLength: Number.POSITIVE_INFINITY,
      lengthGrowthPerTick: 0,
      speedRank: "low",
      expireTicks: totalTicks,
      spawnOffset: 0,
      pinned: true,
      anchored: true,
      rayLike: true,
      visibleFrom: ctx.frame + windupTicks,
    });
    const masterSpark = ctx.projectiles[ctx.projectiles.length - 1];
    if (masterSpark) {
      masterSpark.pausedUntil = ctx.frame + windupTicks;
    }

    fighter.invulnerableDelayRemaining = windupTicks;
    fighter.invulnerableDelayDuration = durationTicks;
  }

  onHit(_ctx: BattleHitContext): void {
    // Marisa has no hit-time modifier by default.
  }
}
