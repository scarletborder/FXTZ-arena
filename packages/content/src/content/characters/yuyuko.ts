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
import { Vanilla } from "../decorators";

const REAR_WINGMAN_FORWARD_OFFSET = -80;
const REAR_WINGMAN_SIDE_OFFSET = 40;
const INNER_WINGMAN_FORWARD_OFFSET = -50;
const INNER_WINGMAN_SIDE_OFFSET = 70;
const BASE_SHOT_OFFSETS = [Math.PI / 12, -Math.PI / 12, Math.PI / 4, -Math.PI / 4] as const;
const WINGMAN_SIDE_SHOT_ANGLE = Math.PI / 12;
const BOMB_LASER_ANGLE_OFFSET = Math.PI / 6;
const NORMAL_BULLET_SIZE = 11;
const BOMB_BULLET_SIZE = 11;
const BOMB_PREVIEW_TICKS = secondsToTicks(1);
const BOMB_LASER_DAMAGE_TICKS = 120;
const BOMB_LASER_DAMAGE = 3;
const BOMB_LASER_HEIGHT = hitCircleUnits(4);
const BOMB_LASER_RENDER_HEIGHT = hitCircleUnits(7);
const BOMB_LASER_SPAWN_TICKS = 6;
const BOMB_LASER_DESPAWN_TICKS = 6;
const BOMB_BULLET_INTERVAL_TICKS = 12;
const BOMB_CENTER_BURST_COUNT = 6;
const BOMB_SIDE_BURST_COUNT = 4;
const BOMB_CENTER_BULLETS_PER_BURST = 7;
const BOMB_SIDE_BULLETS_PER_BURST = 5;
const BOMB_CENTER_SPREAD = Math.PI / 4;
const BOMB_SIDE_SPREAD = Math.PI / 5;
const CLEAR_RING_TICKS = secondsToTicks(2 / 3);
const CLEAR_RING_RADIUS_MULTIPLIER = 32;
const BOMB_COOLDOWN_TICKS = secondsToTicks(4);
const NORMAL_ANGLE_15_DAMAGE = 40;
const NORMAL_ANGLE_45_DAMAGE = 20;
const TIER2_WINGMAN_DAMAGE = 20;
const TIER3_WINGMAN_DAMAGE = 15;
const TIER4_WINGMAN_DAMAGE = 10;
const BOMB_CENTER_BULLET_DAMAGE = 20;
const BOMB_SIDE_BULLET_DAMAGE = 10;
const BOMB_RANDOM_STEP = 12.9898;
const BOMB_RANDOM_SEED = 78.233;
const BOMB_RANDOM_SCALE = 43758.5453;

interface WingmanConfig {
  readonly forward: number;
  readonly side: number;
  readonly shotOffsets: readonly number[];
}

export class YuyukoBattleCharacter extends BattleCharacter {
  readonly id = "yuyuko" as CharacterDefinition["id"];
  readonly name = "content.characters.yuyuko.name";
  readonly cost = 5;
  readonly roleClass = "suppress" as CharacterDefinition["roleClass"];
  readonly moveSpeed = "low" as CharacterDefinition["moveSpeed"];
  readonly fireRate = "medium" as CharacterDefinition["fireRate"];
  readonly ammoCapacity = 6;
  readonly reloadTicksPerAmmo = secondsToTicks(0.9);
  readonly reloadStartPolicy =
    "reset_to_zero" as CharacterDefinition["reloadStartPolicy"];
  readonly reloadCommitPolicy =
    "commit_per_ammo" as CharacterDefinition["reloadCommitPolicy"];
  readonly bulletSpeed = "low" as CharacterDefinition["bulletSpeed"];
  readonly description = "content.characters.yuyuko.description";
  readonly gallery: CharacterGalleryAssets = {
    portraitAsset: "assets/characters/yuyuko/portrait.png",
    attackPreviewAsset: "assets/characters/yuyuko/preview.png",
    combatAsset: "assets/characters/yuyuko/combat.png",
  };
  readonly normalAttackId = "yuyuko_butterfly_shot";
  readonly bombId = "yuyuko_ghost_butterfly_bomb";
  readonly pointCollectRadius = DEFAULT_POINT_COLLECT_RADIUS;

  shoot(
    ctx: CharacterActionContext,
    fighter: FighterState,
    aimX: number,
    aimY: number,
  ): void {
    const angle = this.aimAngle(fighter, aimX, aimY);
    const tier = this.pointPowerTier(fighter);

    for (const offset of BASE_SHOT_OFFSETS) {
      const absOffset = Math.abs(offset);
      this.spawnButterflyBullet(ctx, fighter, fighter.x, fighter.y, angle + offset, {
        textureKey:
          absOffset === Math.PI / 12
            ? "bullet_type_19_offset_3"
            : "bullet_type_19_offset_4",
        speedRank: "low",
        damage:
          absOffset === Math.PI / 12
            ? NORMAL_ANGLE_15_DAMAGE
            : NORMAL_ANGLE_45_DAMAGE,
      });
    }

    for (const wingman of this.wingmenForTier(tier)) {
      const position = this.offsetPosition(
        fighter.x,
        fighter.y,
        angle,
        wingman.forward,
        wingman.side,
      );
      for (const shotOffset of wingman.shotOffsets) {
        this.spawnButterflyBullet(
          ctx,
          fighter,
          position.x,
          position.y,
          angle + shotOffset,
          {
            textureKey: "bullet_type_19_offset_2",
            speedRank: "low",
            damage: this.wingmanDamageForTier(tier),
          },
        );
      }
    }
  }

  useBomb(
    ctx: CharacterActionContext,
    fighter: FighterState,
    aimX: number,
    aimY: number,
  ): void {
    this.startBomb(ctx, fighter, BOMB_COOLDOWN_TICKS);
    this.setInvulnerable(fighter, BOMB_PREVIEW_TICKS + BOMB_LASER_DAMAGE_TICKS);
    const radius = this.clearProjectiles(
      ctx,
      fighter,
      CLEAR_RING_RADIUS_MULTIPLIER,
      CLEAR_RING_TICKS,
    );
    this.spawnClearRing(ctx, fighter, radius, 0xd7b6ff, CLEAR_RING_TICKS);

    const angle = this.aimAngle(fighter, aimX, aimY);
    fighter.actionLockedUntil = Math.max(
      fighter.actionLockedUntil,
      BOMB_PREVIEW_TICKS,
    );

    for (const offset of [-BOMB_LASER_ANGLE_OFFSET, BOMB_LASER_ANGLE_OFFSET]) {
      const laserAngle = angle + offset;
      this.spawnBombPreviewLaser(ctx, fighter, laserAngle);
      this.spawnBombLaser(ctx, fighter, laserAngle);
    }

    this.spawnBombButterflyBursts(ctx, fighter, angle);
  }

  onHit(_ctx: BattleHitContext): void {
    // Yuyuko has no hit-time modifier by default.
  }

  private wingmenForTier(tier: number): readonly WingmanConfig[] {
    if (tier < 2) {
      return [];
    }

    const wingmen: WingmanConfig[] = [
      {
        forward: REAR_WINGMAN_FORWARD_OFFSET,
        side: -REAR_WINGMAN_SIDE_OFFSET,
        shotOffsets: tier >= 3 ? [0, -WINGMAN_SIDE_SHOT_ANGLE] : [0],
      },
      {
        forward: REAR_WINGMAN_FORWARD_OFFSET,
        side: REAR_WINGMAN_SIDE_OFFSET,
        shotOffsets: tier >= 3 ? [0, WINGMAN_SIDE_SHOT_ANGLE] : [0],
      },
    ];

    if (tier >= 4) {
      wingmen.push(
        {
          forward: INNER_WINGMAN_FORWARD_OFFSET,
          side: -INNER_WINGMAN_SIDE_OFFSET,
          shotOffsets: [0, -WINGMAN_SIDE_SHOT_ANGLE],
        },
        {
          forward: INNER_WINGMAN_FORWARD_OFFSET,
          side: INNER_WINGMAN_SIDE_OFFSET,
          shotOffsets: [0, WINGMAN_SIDE_SHOT_ANGLE],
        },
      );
    }

    return wingmen;
  }

  private wingmanDamageForTier(tier: number): number {
    if (tier >= 4) return TIER4_WINGMAN_DAMAGE;
    if (tier >= 3) return TIER3_WINGMAN_DAMAGE;
    return TIER2_WINGMAN_DAMAGE;
  }

  private spawnButterflyBullet(
    ctx: CharacterActionContext,
    fighter: FighterState,
    x: number,
    y: number,
    angle: number,
    params: {
      readonly textureKey: string;
      readonly speedRank: "low" | "medium";
      readonly damage: number;
      readonly frameDelay?: number;
    },
  ): void {
    ctx.spawnBullet({
      owner: fighter.key,
      textureKey: params.textureKey,
      kind: "orb",
      x,
      y,
      angle,
      speedRank: params.speedRank,
      width: params.speedRank === "medium" ? BOMB_BULLET_SIZE : NORMAL_BULLET_SIZE,
      height: params.speedRank === "medium" ? BOMB_BULLET_SIZE : NORMAL_BULLET_SIZE,
      homingTicks: 0,
      damage: params.damage,
      spawnOffset: 0,
      frame: ctx.frame + (params.frameDelay ?? 0),
    });
  }

  private spawnBombPreviewLaser(
    ctx: CharacterActionContext,
    fighter: FighterState,
    angle: number,
  ): void {
    ctx.spawnLaser({
      owner: fighter.key,
      x: fighter.x,
      y: fighter.y,
      angle,
      textureKey: "bullet_type_19_offset_4",
      renderHeight: hitCircleUnits(1.5),
      initialLength: Number.POSITIVE_INFINITY,
      maxLength: Number.POSITIVE_INFINITY,
      lengthGrowthPerTick: 0,
      speedRank: "low",
      expireTicks: BOMB_PREVIEW_TICKS,
      damage: 0,
      spawnOffset: 0,
      pinned: true,
      anchored: true,
      rayLike: true,
      couldClear: false,
    });
  }

  private spawnBombLaser(
    ctx: CharacterActionContext,
    fighter: FighterState,
    angle: number,
  ): void {
    const visibleFrom = ctx.frame + BOMB_PREVIEW_TICKS;
    const damageFrom = visibleFrom + BOMB_LASER_SPAWN_TICKS;
    const damageUntil = damageFrom + BOMB_LASER_DAMAGE_TICKS;
    ctx.spawnLaser({
      owner: fighter.key,
      x: fighter.x,
      y: fighter.y,
      angle,
      textureKey: "laser_type_1_offset_4",
      height: BOMB_LASER_HEIGHT,
      renderHeight: BOMB_LASER_RENDER_HEIGHT,
      laserVisualStyle: "th06",
      laserFramePairStartOffset: 4,
      laserSpawnTicks: BOMB_LASER_SPAWN_TICKS,
      laserDespawnTicks: BOMB_LASER_DESPAWN_TICKS,
      initialLength: Number.POSITIVE_INFINITY,
      maxLength: Number.POSITIVE_INFINITY,
      lengthGrowthPerTick: 0,
      speedRank: "low",
      expireTicks:
        BOMB_PREVIEW_TICKS +
        BOMB_LASER_SPAWN_TICKS +
        BOMB_LASER_DAMAGE_TICKS +
        BOMB_LASER_DESPAWN_TICKS,
      damage: BOMB_LASER_DAMAGE,
      spawnOffset: 0,
      pinned: true,
      anchored: true,
      rayLike: true,
      visibleFrom,
      pausedUntil: visibleFrom,
      damageFrom,
      damageUntil,
      couldClear: false,
      clearsProjectiles: true,
      piercesTargets: true,
    });
  }

  private spawnBombButterflyBursts(
    ctx: CharacterActionContext,
    fighter: FighterState,
    angle: number,
  ): void {
    for (let burst = 0; burst < BOMB_CENTER_BURST_COUNT; burst += 1) {
      this.spawnBombBurst(ctx, fighter, {
        baseAngle: angle,
        spread: BOMB_CENTER_SPREAD,
        count: BOMB_CENTER_BULLETS_PER_BURST,
        damage: BOMB_CENTER_BULLET_DAMAGE,
        frameDelay: BOMB_PREVIEW_TICKS + burst * BOMB_BULLET_INTERVAL_TICKS,
        seed: burst,
      });
    }

    for (const side of [-1, 1]) {
      for (let burst = 0; burst < BOMB_SIDE_BURST_COUNT; burst += 1) {
        this.spawnBombBurst(ctx, fighter, {
          baseAngle: angle + side * (BOMB_LASER_ANGLE_OFFSET + BOMB_SIDE_SPREAD),
          spread: BOMB_SIDE_SPREAD,
          count: BOMB_SIDE_BULLETS_PER_BURST,
          damage: BOMB_SIDE_BULLET_DAMAGE,
          frameDelay: BOMB_PREVIEW_TICKS + burst * BOMB_BULLET_INTERVAL_TICKS,
          seed: 100 + side * 20 + burst,
        });
      }
    }
  }

  private spawnBombBurst(
    ctx: CharacterActionContext,
    fighter: FighterState,
    params: {
      readonly baseAngle: number;
      readonly spread: number;
      readonly count: number;
      readonly damage: number;
      readonly frameDelay: number;
      readonly seed: number;
    },
  ): void {
    const center = (params.count - 1) / 2;
    for (let index = 0; index < params.count; index += 1) {
      const jitter = (this.pseudoRandom(params.seed, index) - 0.5) * params.spread * 0.5;
      const angle =
        params.baseAngle +
        ((index - center) / Math.max(1, center)) * params.spread +
        jitter;
      this.spawnButterflyBullet(ctx, fighter, fighter.x, fighter.y, angle, {
        textureKey: `bullet_type_19_offset_${index % 8}`,
        speedRank: "medium",
        damage: params.damage,
        frameDelay: params.frameDelay,
      });
    }
  }

  private pseudoRandom(seed: number, index: number): number {
    const value =
      Math.sin((seed + 1) * BOMB_RANDOM_STEP + (index + 1) * BOMB_RANDOM_SEED) *
      BOMB_RANDOM_SCALE;
    return value - Math.floor(value);
  }
}

Vanilla.registerCharacter("yuyuko")(YuyukoBattleCharacter);
