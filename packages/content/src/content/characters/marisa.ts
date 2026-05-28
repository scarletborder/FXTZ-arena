import type { CharacterDefinition, CharacterGalleryAssets } from "./types";

import type { FighterState } from "../battle-types";
import type { BattleHitContext } from "../ability-cards/base";
import {
  BattleCharacter,
  hitCircleUnits,
  secondsToTicks,
  type CharacterActionContext,
} from "./base";
import { Vanilla } from "../decorators";

const REAR_BEAM_DIAGONAL_ANGLE = Math.PI / 18;
const NORMAL_SHOOT_DAMAGE = 6; // 乘以9
const REAR_BEAM_DAMAGE = 1; // 乘以31

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
  readonly reloadStartPolicy =
    "reset_to_zero" as CharacterDefinition["reloadStartPolicy"];
  readonly reloadCommitPolicy =
    "commit_on_finish" as CharacterDefinition["reloadCommitPolicy"];
  readonly bulletSpeed = "high" as CharacterDefinition["bulletSpeed"];
  readonly description = "· 路边的普通魔法使\n· 高速激光的狙击性机体，弹幕具有高额伤害\n· bomb可发射超大型魔炮";
  readonly gallery: CharacterGalleryAssets = {
    portraitAsset: "assets/characters/marisa/portrait.png",
    attackPreviewAsset: "assets/characters/marisa/attack-preview.png",
    combatAsset: "assets/characters/marisa/combat.png",
  };
  readonly normalAttackId = "marisa_laser";
  readonly bombId = "marisa_master_spark";
  readonly pointCollectRadius = 196;

  shoot(
    ctx: CharacterActionContext,
    fighter: FighterState,
    aimX: number,
    aimY: number,
  ): void {
    const angle = this.aimAngle(fighter, aimX, aimY);
    const tier = this.pointPowerTier(fighter);
    const centerOffsets =
      tier >= 3 ? [-hitCircleUnits(2.5), hitCircleUnits(2.5)] : [0];
    for (const offset of centerOffsets) {
      const position = this.offsetPosition(
        fighter.x,
        fighter.y,
        angle,
        0,
        offset,
      );
      this.spawnNormalLaser(ctx, fighter, position.x, position.y, angle);
    }

    if (tier >= 2) {
      this.spawnRearBeams(ctx, fighter, angle, tier);
    }
  }

  useBomb(ctx: CharacterActionContext, fighter: FighterState): void {
    this.startBomb(ctx, fighter, secondsToTicks(4));
    const clearRingTicks = secondsToTicks(1);
    const radius = this.clearProjectiles(ctx, fighter, 24, clearRingTicks);
    this.spawnClearRing(ctx, fighter, radius, 0xff6b6b, clearRingTicks);

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
      couldClear: false,
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
      damage: 10,
      expireTicks: totalTicks,
      spawnOffset: 0,
      pinned: true,
      anchored: true,
      rayLike: true,
      visibleFrom: ctx.frame + windupTicks,
      pausedUntil: ctx.frame + windupTicks,
      couldClear: false,
    });

    fighter.invulnerableDelayRemaining = windupTicks;
    fighter.invulnerableDelayDuration = durationTicks;
  }

  onHit(_ctx: BattleHitContext): void {
    // Marisa has no hit-time modifier by default.
  }

  private spawnNormalLaser(
    ctx: CharacterActionContext,
    fighter: FighterState,
    x: number,
    y: number,
    angle: number,
  ): void {
    ctx.spawnLaser({
      owner: fighter.key,
      textureKey: "laser_type_1_offset_13",
      x,
      y,
      angle,
      height: hitCircleUnits(3),
      initialLength: hitCircleUnits(3),
      maxLength: hitCircleUnits(16),
      lengthGrowthPerTick: hitCircleUnits(1),
      speedRank: "high",
      damage: NORMAL_SHOOT_DAMAGE,
      couldClear: false,
    });
  }

  private spawnRearBeams(
    ctx: CharacterActionContext,
    fighter: FighterState,
    angle: number,
    tier: number,
  ): void {
    const windupTicks = 24;
    const durationTicks = 30;
    const sideOffset = hitCircleUnits(8);
    const rearOffset = -hitCircleUnits(16);
    const beamOffsets = [-sideOffset, sideOffset];

    for (const side of beamOffsets) {
      const position = this.offsetPosition(
        fighter.x,
        fighter.y,
        angle,
        rearOffset,
        side,
      );
      const angleOffsets =
        tier >= 4
          ? [0, side < 0 ? -REAR_BEAM_DIAGONAL_ANGLE : REAR_BEAM_DIAGONAL_ANGLE]
          : [0];
      for (const angleOffset of angleOffsets) {
        const beamAngle = angle + angleOffset;
        this.spawnRearBeamPreview(
          ctx,
          fighter,
          position.x,
          position.y,
          beamAngle,
          windupTicks,
        );
        this.spawnRearBeam(
          ctx,
          fighter,
          position.x,
          position.y,
          beamAngle,
          windupTicks,
          durationTicks,
        );
      }
    }
  }

  private spawnRearBeamPreview(
    ctx: CharacterActionContext,
    fighter: FighterState,
    x: number,
    y: number,
    angle: number,
    expireTicks: number,
  ): void {
    ctx.spawnLaser({
      owner: fighter.key,
      textureKey: "laser_type_1_offset_5",
      x,
      y,
      angle,
      height: hitCircleUnits(2),
      initialLength: Number.POSITIVE_INFINITY,
      maxLength: Number.POSITIVE_INFINITY,
      lengthGrowthPerTick: 0,
      speedRank: "low",
      expireTicks,
      damage: 0,
      spawnOffset: 0,
      pinned: true,
      anchored: true,
      rayLike: true,
      couldClear: false,
    });
  }

  private spawnRearBeam(
    ctx: CharacterActionContext,
    fighter: FighterState,
    x: number,
    y: number,
    angle: number,
    frameDelay: number,
    expireTicks: number,
  ): void {
    ctx.spawnLaser({
      owner: fighter.key,
      textureKey: "laser_type_1_offset_5",
      x,
      y,
      angle,
      height: hitCircleUnits(2),
      initialLength: Number.POSITIVE_INFINITY,
      maxLength: Number.POSITIVE_INFINITY,
      lengthGrowthPerTick: 0,
      speedRank: "low",
      expireTicks,
      damage: REAR_BEAM_DAMAGE,
      spawnOffset: 0,
      pinned: true,
      anchored: true,
      rayLike: true,
      visibleFrom: ctx.frame + frameDelay,
      pausedUntil: ctx.frame + frameDelay,
      frame: ctx.frame + frameDelay,
      couldClear: false,
    });
  }
}
