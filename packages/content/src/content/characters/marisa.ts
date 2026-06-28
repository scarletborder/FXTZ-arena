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
import { t } from "@repo/i18n";

const REAR_BEAM_DIAGONAL_ANGLE = Math.PI / 18;
const NORMAL_SHOT_LENGTH = hitCircleUnits(16);
const NORMAL_SHOT_THICKNESS = hitCircleUnits(3);
const NORMAL_SHOOT_DAMAGE_BY_TIER = {
  1: 105,
  2: 105,
  3: 75,
  4: 75,
} as const;
const REAR_BEAM_DAMAGE = 1;
const REAR_BEAM_WINDUP_TICKS = 24;
const REAR_BEAM_SPAWN_TICKS = 6;
const REAR_BEAM_DURATION_TICKS = 25;
const REAR_BEAM_TIER4_SIDE_DURATION_TICKS = 20;
const REAR_BEAM_DESPAWN_TICKS = 6;
const REAR_BEAM_THICKNESS = hitCircleUnits(2);
const BOMB_WINDUP_TICKS = secondsToTicks(0.6);
const BOMB_DAMAGE_DURATION_TICKS = 150;
const BOMB_FRAME_DAMAGE = 5;
const BOMB_SPARK_HIT_HEIGHT = hitCircleUnits(36);
const BOMB_SPARK_RENDER_HEIGHT = hitCircleUnits(54);
const BOMB_SPARK_EXPAND_TICKS = 12;

export class MarisaBattleCharacter extends BattleCharacter {
  readonly id = "marisa" as CharacterDefinition["id"];
  readonly name = t("content.characters.marisa.name");
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
  readonly description = t("content.characters.marisa.description");
  readonly gallery: CharacterGalleryAssets = {
    portraitAsset: "assets/characters/marisa/portrait.png",
    attackPreviewAsset: "assets/characters/marisa/preview.png",
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
      this.spawnNormalLaser(
        ctx,
        fighter,
        position.x,
        position.y,
        angle,
        NORMAL_SHOOT_DAMAGE_BY_TIER[tier],
      );
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

    const windupTicks = BOMB_WINDUP_TICKS;
    const durationTicks = BOMB_DAMAGE_DURATION_TICKS;
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
      height: 0,
      renderHeight: 0,
      maxHeight: BOMB_SPARK_HIT_HEIGHT,
      heightGrowthPerTick: BOMB_SPARK_HIT_HEIGHT / BOMB_SPARK_EXPAND_TICKS,
      maxRenderHeight: BOMB_SPARK_RENDER_HEIGHT,
      renderHeightGrowthPerTick:
        BOMB_SPARK_RENDER_HEIGHT / BOMB_SPARK_EXPAND_TICKS,
      initialLength: Number.POSITIVE_INFINITY,
      maxLength: Number.POSITIVE_INFINITY,
      lengthGrowthPerTick: 0,
      speedRank: "low",
      damage: BOMB_FRAME_DAMAGE,
      expireTicks: totalTicks,
      spawnOffset: 0,
      pinned: true,
      anchored: true,
      rayLike: true,
      visibleFrom: ctx.frame + windupTicks,
      pausedUntil: ctx.frame + windupTicks,
      couldClear: false,
      clearsProjectiles: true,
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
    damage: number,
  ): void {
    ctx.spawnBullet({
      owner: fighter.key,
      textureKey: "laser_type_1_offset_13",
      kind: "knife",
      x,
      y,
      angle,
      width: NORMAL_SHOT_LENGTH,
      height: NORMAL_SHOT_THICKNESS,
      laserRenderMode: "tiled",
      speedRank: "high",
      homingTicks: 0,
      damage,
      spawnOffset: NORMAL_SHOT_LENGTH / 2,
      couldClear: false,
    });
  }

  private spawnRearBeams(
    ctx: CharacterActionContext,
    fighter: FighterState,
    angle: number,
    tier: number,
  ): void {
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
          REAR_BEAM_WINDUP_TICKS,
        );
        this.spawnRearBeam(
          ctx,
          fighter,
          position.x,
          position.y,
          beamAngle,
          REAR_BEAM_WINDUP_TICKS,
          tier >= 4 && angleOffset !== 0
            ? REAR_BEAM_TIER4_SIDE_DURATION_TICKS
            : REAR_BEAM_DURATION_TICKS,
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
      x,
      y,
      angle,
      renderHeight: REAR_BEAM_THICKNESS,
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
    const visibleFrom = ctx.frame + frameDelay;
    const damageFrom = visibleFrom + REAR_BEAM_SPAWN_TICKS;
    const damageUntil = damageFrom + expireTicks;
    ctx.spawnLaser({
      owner: fighter.key,
      x,
      y,
      angle,
      height: REAR_BEAM_THICKNESS,
      renderHeight: REAR_BEAM_THICKNESS,
      laserVisualStyle: "th06",
      laserFramePairStartOffset: 1,
      laserSpawnTicks: REAR_BEAM_SPAWN_TICKS,
      laserDespawnTicks: REAR_BEAM_DESPAWN_TICKS,
      initialLength: Number.POSITIVE_INFINITY,
      maxLength: Number.POSITIVE_INFINITY,
      lengthGrowthPerTick: 0,
      speedRank: "low",
      expireTicks:
        frameDelay +
        REAR_BEAM_SPAWN_TICKS +
        expireTicks +
        REAR_BEAM_DESPAWN_TICKS,
      damage: REAR_BEAM_DAMAGE,
      spawnOffset: 0,
      pinned: true,
      anchored: true,
      rayLike: true,
      visibleFrom,
      pausedUntil: ctx.frame + frameDelay,
      damageFrom,
      damageUntil,
      couldClear: false,
    });
  }
}

Vanilla.registerCharacter("marisa")(MarisaBattleCharacter);
