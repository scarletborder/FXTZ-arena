import type { CharacterDefinition, CharacterGalleryAssets } from "./types";

import type { FighterState } from "../battle-types";
import type { BattleHitContext } from "../ability-cards/base";
import { BattleCharacter, hitCircleUnits, secondsToTicks, type CharacterActionContext } from "./base";
import { Vanilla } from "../decorators";

@Vanilla.RegisterCharacter("marisa")
export class MarisaBattleCharacter extends BattleCharacter {
  readonly id = "marisa" as CharacterDefinition["id"];
  readonly name = "魔理沙";
  readonly cost = 5;
  readonly roleClass = "sniper" as CharacterDefinition["roleClass"];
  readonly moveSpeed = "high" as CharacterDefinition["moveSpeed"];
  readonly fireRate = "low" as CharacterDefinition["fireRate"];
  readonly ammoCapacity = 2;
  readonly reloadTicksPerAmmo = secondsToTicks(1.5);
  readonly reloadStartPolicy = "reset_to_zero" as CharacterDefinition["reloadStartPolicy"];
  readonly reloadCommitPolicy = "commit_on_finish" as CharacterDefinition["reloadCommitPolicy"];
  readonly bulletSpeed = "high" as CharacterDefinition["bulletSpeed"];
  readonly description = "高速激光与长前摇魔炮，爆发强但动作约束明显。";
  readonly gallery: CharacterGalleryAssets = {
    portraitAsset: "assets/characters/marisa/portrait.png",
    attackPreviewAsset: "assets/characters/marisa/attack-preview.png",
  };
  readonly normalAttackId = "marisa_laser";
  readonly bombId = "marisa_master_spark";

  shoot(ctx: CharacterActionContext, fighter: FighterState, aimX: number, aimY: number): void {
    ctx.spawnLaser({
      owner: fighter.key,
      x: fighter.x,
      y: fighter.y,
      angle: this.aimAngle(fighter, aimX, aimY),
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

    ctx.spawnLaser({
      owner: fighter.key,
      x: fighter.x,
      y: fighter.y,
      angle,
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

    ctx.spawnLaser({
      owner: fighter.key,
      kind: "spark",
      x: fighter.x,
      y: fighter.y,
      angle,
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
      pausedUntil: ctx.frame + windupTicks,
    });

    fighter.invulnerableDelayRemaining = windupTicks;
    fighter.invulnerableDelayDuration = durationTicks;
  }

  onHit(_ctx: BattleHitContext): void {
    // Marisa has no hit-time modifier by default.
  }
}
