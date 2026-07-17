import { fp } from "@shaisrc/fixed-point";

import type { CharacterDefinition, CharacterGalleryAssets } from "./types";
import type { FighterState } from "../battle-types";
import type { BattleHitContext } from "../ability-cards/base";
import {
  BattleCharacter,
  BulletCmd,
  DEFAULT_POINT_COLLECT_RADIUS,
  hitCircleUnits,
  secondsToTicks,
  type CharacterActionContext,
} from "./base";
import { Vanilla } from "../decorators";
import { fpAtan2 } from "../fp";

const NORMAL_TEXTURE = "bullet_type_5_offset_2";
const LARGE_ORB_TEXTURE = "bullet_type_23_offset_0";
const BOMB_FAST_TEXTURE = "bullet_type_26_offset_3";
const BOMB_HOMING_TEXTURE = "bullet_type_28_offset_6";

const FAMILIAR_REAR_OFFSET = -48;
const TIER1_FAMILIAR_SIDE_OFFSETS = [-32, 32] as const;
const TIER3_FAMILIAR_SIDE_OFFSETS = [-72, -24, 24, 72] as const;
const INNER_SHOT_ANGLE = degreesToRadians(60);
const OUTER_SHOT_ANGLE = degreesToRadians(30);
const NORMAL_PAIR_INTERVAL_TICKS = 8;
const NORMAL_BULLET_SIZE = 6;
const LARGE_ORB_SIZE = 38;

const NORMAL_DAMAGE_BY_TIER = {
  1: 40,
  2: 40,
  3: 30,
  4: 30,
} as const;
const LARGE_ORB_DAMAGE = 50;

// Shinki uses the same beam telegraph and presentation timings as Marisa.
const BEAM_WINDUP_TICKS = 24;
const BEAM_SPAWN_TICKS = 6;
const BEAM_DURATION_TICKS = 10;
const BEAM_DESPAWN_TICKS = 6;
const BEAM_THICKNESS = hitCircleUnits(2);

const BOMB_LINE_ANGLES = [45, 55, 65, 75, 85] as const;
const BOMB_VOLLEY_COUNT = 12;
const BOMB_VOLLEY_INTERVAL_TICKS = 24;
const BOMB_PAIR_INTERVAL_TICKS = 8;
const BOMB_FAST_BULLET_SIZE = 8;
const BOMB_FAST_DAMAGE = 10;
const BOMB_HOMING_COUNT = 8;
const BOMB_HOMING_INTERVAL_TICKS = 32;
const BOMB_HOMING_TICKS = secondsToTicks(2);
const BOMB_HOMING_BULLET_SIZE = 24;
const BOMB_HOMING_DAMAGE = 40;
const BOMB_LAST_SHOT_TICK =
  (BOMB_VOLLEY_COUNT - 1) * BOMB_VOLLEY_INTERVAL_TICKS +
  BOMB_PAIR_INTERVAL_TICKS;

export class ShinkiBattleCharacter extends BattleCharacter {
  readonly id = "shinki" as CharacterDefinition["id"];
  readonly name = "content.characters.shinki.name";
  readonly cost = 5;
  readonly roleClass = "suppress" as CharacterDefinition["roleClass"];
  readonly moveSpeed = "medium" as CharacterDefinition["moveSpeed"];
  readonly fireRate = "medium" as CharacterDefinition["fireRate"];
  readonly ammoCapacity = 4;
  readonly reloadTicksPerAmmo = secondsToTicks(1);
  readonly reloadStartPolicy =
    "keep_current" as CharacterDefinition["reloadStartPolicy"];
  readonly reloadCommitPolicy =
    "commit_per_ammo" as CharacterDefinition["reloadCommitPolicy"];
  readonly bulletSpeed = "medium" as CharacterDefinition["bulletSpeed"];
  readonly description = "content.characters.shinki.description";
  readonly gallery: CharacterGalleryAssets = {
    portraitAsset: "assets/characters/shinki/portrait.png",
    attackPreviewAsset: "assets/characters/shinki/portrait.png",
    combatAsset: "assets/characters/shinki/combat.png",
  };
  readonly normalAttackId = "shinki_familiar_barrage";
  readonly bombId = "shinki_ten_line_barrage";
  readonly pointCollectRadius = DEFAULT_POINT_COLLECT_RADIUS;

  shoot(
    ctx: CharacterActionContext,
    fighter: FighterState,
    aimX: number,
    aimY: number,
  ): void {
    const axisAngle = this.aimAngle(fighter, aimX, aimY);
    const tier = this.pointPowerTier(fighter);
    const sideOffsets =
      tier >= 3
        ? TIER3_FAMILIAR_SIDE_OFFSETS
        : TIER1_FAMILIAR_SIDE_OFFSETS;

    for (const sideOffset of sideOffsets) {
      const familiar = this.offsetPosition(
        fighter.x,
        fighter.y,
        axisAngle,
        FAMILIAR_REAR_OFFSET,
        sideOffset,
      );
      const sideDirection = sideOffset < 0 ? 1 : -1;
      const innerAngle = axisAngle + sideDirection * INNER_SHOT_ANGLE;
      const outerAngle = axisAngle - sideDirection * OUTER_SHOT_ANGLE;

      for (const frameDelay of [0, NORMAL_PAIR_INTERVAL_TICKS]) {
        this.spawnBullet(ctx, fighter, {
          x: familiar.x,
          y: familiar.y,
          angle: innerAngle,
          textureKey: NORMAL_TEXTURE,
          speedRank: "medium",
          size: NORMAL_BULLET_SIZE,
          damage: NORMAL_DAMAGE_BY_TIER[tier],
          frameDelay,
        });
        this.spawnBullet(ctx, fighter, {
          x: familiar.x,
          y: familiar.y,
          angle: outerAngle,
          textureKey: NORMAL_TEXTURE,
          speedRank: "medium",
          size: NORMAL_BULLET_SIZE,
          damage: NORMAL_DAMAGE_BY_TIER[tier],
          frameDelay,
        });
      }

      if (tier >= 2) {
        this.spawnBeamPair(
          ctx,
          fighter,
          familiar.x,
          familiar.y,
          axisAngle,
          tier >= 3 ? 2 : 3,
        );
      }
    }

    if (tier >= 4) {
      for (const sideOffset of [-24, 24]) {
        const familiar = this.offsetPosition(
          fighter.x,
          fighter.y,
          axisAngle,
          FAMILIAR_REAR_OFFSET,
          sideOffset,
        );
        const shotAngle = fpAtan2(
          fp.fromFloat(aimY - familiar.y),
          fp.fromFloat(aimX - familiar.x),
        );
        this.spawnBullet(ctx, fighter, {
          x: familiar.x,
          y: familiar.y,
          angle: shotAngle,
          textureKey: LARGE_ORB_TEXTURE,
          speedRank: "high",
          size: LARGE_ORB_SIZE,
          damage: LARGE_ORB_DAMAGE,
          frameDelay: 0,
        });
      }
    }
  }

  useBomb(
    ctx: CharacterActionContext,
    fighter: FighterState,
    aimX: number,
    aimY: number,
  ): void {
    this.startBomb(ctx, fighter, BOMB_LAST_SHOT_TICK + 1);
    this.setInvulnerable(fighter, BOMB_LAST_SHOT_TICK + 1);
    const clearTicks = secondsToTicks(1);
    const radius = this.clearProjectiles(ctx, fighter, 24, clearTicks);
    this.spawnClearRing(ctx, fighter, radius, 0xe8b6ff, clearTicks);

    const axisAngle = this.aimAngle(fighter, aimX, aimY);
    for (const angleDegrees of BOMB_LINE_ANGLES) {
      const angleOffset = degreesToRadians(angleDegrees);
      for (const sideDirection of [-1, 1]) {
        ctx.schedule(
          new BulletCmd({
            owner: fighter.key,
            sourceCharacterId: this.id,
            textureKey: BOMB_FAST_TEXTURE,
            kind: "orb",
            x: fighter.x,
            y: fighter.y,
            angle: axisAngle + sideDirection * angleOffset,
            speedRank: "high",
            width: BOMB_FAST_BULLET_SIZE,
            height: BOMB_FAST_BULLET_SIZE,
            homingTicks: 0,
            damage: BOMB_FAST_DAMAGE,
            spawnOffset: 0,
            couldClear: true,
          })
            .burst(2, BOMB_PAIR_INTERVAL_TICKS)
            .repeat(BOMB_VOLLEY_COUNT, BOMB_VOLLEY_INTERVAL_TICKS),
        );
      }
    }

    ctx.schedule(
      new BulletCmd({
        owner: fighter.key,
        sourceCharacterId: this.id,
        textureKey: BOMB_HOMING_TEXTURE,
        kind: "orb",
        x: fighter.x,
        y: fighter.y,
        angle: axisAngle,
        speedRank: "medium",
        width: BOMB_HOMING_BULLET_SIZE,
        height: BOMB_HOMING_BULLET_SIZE,
        homingTicks: BOMB_HOMING_TICKS,
        damage: BOMB_HOMING_DAMAGE,
        spawnOffset: 0,
        couldClear: true,
      }).repeat(BOMB_HOMING_COUNT, BOMB_HOMING_INTERVAL_TICKS),
    );
  }

  onHit(_ctx: BattleHitContext): void {
    // Shinki has no hit-time modifier by default.
  }

  private spawnBullet(
    ctx: CharacterActionContext,
    fighter: FighterState,
    params: {
      readonly x: number;
      readonly y: number;
      readonly angle: number;
      readonly textureKey: string;
      readonly speedRank: "medium" | "high";
      readonly size: number;
      readonly damage: number;
      readonly frameDelay: number;
    },
  ): void {
    ctx.spawnBullet({
      owner: fighter.key,
      sourceCharacterId: this.id,
      textureKey: params.textureKey,
      kind: "orb",
      x: params.x,
      y: params.y,
      angle: params.angle,
      speedRank: params.speedRank,
      width: params.size,
      height: params.size,
      homingTicks: 0,
      damage: params.damage,
      spawnOffset: 0,
      frame: ctx.frame + params.frameDelay,
      couldClear: true,
    });
  }

  private spawnBeamPair(
    ctx: CharacterActionContext,
    fighter: FighterState,
    x: number,
    y: number,
    angle: number,
    damage: number,
  ): void {
    ctx.spawnLaser({
      owner: fighter.key,
      sourceCharacterId: this.id,
      x,
      y,
      angle,
      renderHeight: BEAM_THICKNESS,
      initialLength: Number.POSITIVE_INFINITY,
      maxLength: Number.POSITIVE_INFINITY,
      lengthGrowthPerTick: 0,
      speedRank: "low",
      expireTicks: BEAM_WINDUP_TICKS,
      damage: 0,
      spawnOffset: 0,
      pinned: true,
      anchored: true,
      rayLike: true,
      couldClear: false,
    });

    const visibleFrom = ctx.frame + BEAM_WINDUP_TICKS;
    const damageFrom = visibleFrom + BEAM_SPAWN_TICKS;
    const damageUntil = damageFrom + BEAM_DURATION_TICKS;
    ctx.spawnLaser({
      owner: fighter.key,
      sourceCharacterId: this.id,
      x,
      y,
      angle,
      height: BEAM_THICKNESS,
      renderHeight: BEAM_THICKNESS,
      laserVisualStyle: "th06",
      laserFramePairStartOffset: 1,
      laserSpawnTicks: BEAM_SPAWN_TICKS,
      laserDespawnTicks: BEAM_DESPAWN_TICKS,
      initialLength: Number.POSITIVE_INFINITY,
      maxLength: Number.POSITIVE_INFINITY,
      lengthGrowthPerTick: 0,
      speedRank: "low",
      expireTicks:
        BEAM_WINDUP_TICKS +
        BEAM_SPAWN_TICKS +
        BEAM_DURATION_TICKS +
        BEAM_DESPAWN_TICKS,
      damage,
      spawnOffset: 0,
      pinned: true,
      anchored: true,
      rayLike: true,
      visibleFrom,
      pausedUntil: visibleFrom,
      damageFrom,
      damageUntil,
      couldClear: false,
    });
  }

}

function degreesToRadians(degrees: number): number {
  return fp.toFloat(
    fp.mul(
      fp.fromFloat(degrees),
      fp.div(fp.fromFloat(Math.PI), fp.fromInt(180)),
    ),
  );
}

Vanilla.registerCharacter("shinki")(ShinkiBattleCharacter);
