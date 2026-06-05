import { bulletSpeedRankToPixelsPerTick } from "@repo/types";

import type { CharacterDefinition, CharacterGalleryAssets } from "./types";

import type { FighterState } from "../battle-types";
import type { BattleHitContext } from "../ability-cards/base";
import {
  BattleCharacter,
  DEFAULT_POINT_COLLECT_RADIUS,
  hitCircleUnits,
  secondsToTicks,
  type CharacterActionContext,
  type PointPowerTier,
} from "./base";
import { Vanilla } from "../decorators";

export const REISEN_COST = 5;
export const REISEN_AMMO_CAPACITY = 8;
export const REISEN_RELOAD_TICKS_PER_AMMO = secondsToTicks(0.5);
export const REISEN_NORMAL_BULLET_SIZE = 15;
export const REISEN_NORMAL_PARALLEL_SIDE_OFFSET = hitCircleUnits(2);
export const REISEN_NORMAL_DIAGONAL_DEGREES = 30;
export const REISEN_NORMAL_REPEAT_DELAY_FRAMES = 6;
export const REISEN_NORMAL_SPLIT_DELAY_TICKS = secondsToTicks(1.2);
export const REISEN_NORMAL_SPLIT_DEGREES = 90;
export const REISEN_NORMAL_FORWARD_SPEED = "medium" as const;
export const REISEN_SHIELD_FORWARD_SPEED = "high" as const;
export const REISEN_NORMAL_DIAGONAL_SPEED = "medium" as const;
export const REISEN_NORMAL_SPLIT_SPEED = "low" as const;
export const REISEN_NORMAL_DAMAGE = 10;
export const REISEN_NORMAL_SPLIT_DAMAGE = 20;
export const REISEN_NORMAL_TIER_COUNTS: Record<PointPowerTier, number> = {
  1: 2,
  2: 8,
  3: 10,
  4: 16,
};

export const REISEN_BOMB_CLEAR_RING_MULTIPLIER = 20;
export const REISEN_BOMB_CLEAR_RING_TICKS = secondsToTicks(0.5);
export const REISEN_BOMB_CLEAR_RING_TINT = 0x87c7ff;
export const REISEN_BOMB_SHIELD_LAYERS = 2;
export const REISEN_BOMB_HIT_CIRCLE_MULTIPLIER = 2;
export const REISEN_SHIELD_INVULNERABLE_TICKS = secondsToTicks(1.2);
export const REISEN_SHIELD_MOVE_SPEED = "low" as const;

const FULL_CIRCLE_DEGREES = 360;

export class ReisenBattleCharacter extends BattleCharacter {
  readonly id = "reisen" as CharacterDefinition["id"];
  readonly name = "铃仙";
  readonly cost = REISEN_COST;
  readonly roleClass = "assault" as CharacterDefinition["roleClass"];
  readonly moveSpeed = "medium" as CharacterDefinition["moveSpeed"];
  readonly fireRate = "medium" as CharacterDefinition["fireRate"];
  readonly ammoCapacity = REISEN_AMMO_CAPACITY;
  readonly reloadTicksPerAmmo = REISEN_RELOAD_TICKS_PER_AMMO;
  readonly reloadStartPolicy =
    "reset_to_zero" as CharacterDefinition["reloadStartPolicy"];
  readonly reloadCommitPolicy =
    "commit_on_finish" as CharacterDefinition["reloadCommitPolicy"];
  readonly bulletSpeed = "medium" as CharacterDefinition["bulletSpeed"];
  readonly description =
    "· 狂气之月兔\n· 擅长中距离压制的突击角色\n· bomb展开消弹圈并获得两层护盾";
  readonly gallery: CharacterGalleryAssets = {
    portraitAsset: "assets/characters/reisen/portrait.png",
    attackPreviewAsset: "assets/characters/reisen/preview.png",
    combatAsset: "assets/characters/reisen/combat.png",
  };
  readonly normalAttackId = "reisen_parallel_lunatic_shot";
  readonly bombId = "reisen_lunatic_shield";
  readonly pointCollectRadius = DEFAULT_POINT_COLLECT_RADIUS;

  shoot(
    ctx: CharacterActionContext,
    fighter: FighterState,
    aimX: number,
    aimY: number,
  ): void {
    const angle = this.aimAngle(fighter, aimX, aimY);
    const tier = this.pointPowerTier(fighter);

    this.spawnForwardVolley(ctx, fighter, angle, 0);
    if (tier >= 2) {
      this.spawnDiagonalVolley(ctx, fighter, angle, 0);
    }
    if (tier >= 3) {
      this.spawnForwardVolley(
        ctx,
        fighter,
        angle,
        REISEN_NORMAL_REPEAT_DELAY_FRAMES,
      );
    }
    if (tier >= 4) {
      this.spawnDiagonalVolley(
        ctx,
        fighter,
        angle,
        REISEN_NORMAL_REPEAT_DELAY_FRAMES,
      );
    }
  }

  useBomb(ctx: CharacterActionContext, fighter: FighterState): void {
    this.startBomb(ctx, fighter, 1);
    const radius = this.clearProjectiles(
      ctx,
      fighter,
      REISEN_BOMB_CLEAR_RING_MULTIPLIER,
      REISEN_BOMB_CLEAR_RING_TICKS,
      true,
    );
    this.spawnClearRing(
      ctx,
      fighter,
      radius,
      REISEN_BOMB_CLEAR_RING_TINT,
      REISEN_BOMB_CLEAR_RING_TICKS,
    );
    fighter.reisenShieldLayers = REISEN_BOMB_SHIELD_LAYERS;
    fighter.hitCircleRadiusMultiplier = REISEN_BOMB_HIT_CIRCLE_MULTIPLIER;
  }

  onHit(ctx: BattleHitContext): void {
    if (
      ctx.victim.reisenShieldLayers <= 0 ||
      ctx.victim.invulnerableUntil > 0
    ) {
      return;
    }
    ctx.victim.reisenShieldLayers -= 1;
    ctx.victim.invulnerableUntil = Math.max(
      ctx.victim.invulnerableUntil,
      REISEN_SHIELD_INVULNERABLE_TICKS,
    );
    ctx.resolution.ignored = true;
    if (ctx.victim.reisenShieldLayers <= 0) {
      ctx.victim.hitCircleRadiusMultiplier = 1;
    }
  }

  canUseBomb(fighter: FighterState): boolean {
    return fighter.reisenShieldLayers <= 0 && super.canUseBomb(fighter);
  }

  private spawnForwardVolley(
    ctx: CharacterActionContext,
    fighter: FighterState,
    angle: number,
    frameDelay: number,
  ): void {
    for (const side of [-1, 1]) {
      const position = this.offsetPosition(
        fighter.x,
        fighter.y,
        angle,
        0,
        side * REISEN_NORMAL_PARALLEL_SIDE_OFFSET,
      );
      this.spawnOrb(ctx, fighter, {
        x: position.x,
        y: position.y,
        angle,
        speedRank:
          fighter.reisenShieldLayers > 0
            ? REISEN_SHIELD_FORWARD_SPEED
            : REISEN_NORMAL_FORWARD_SPEED,
        textureKey: "bullet_type_8_offset_0",
        frameDelay,
        damage: REISEN_NORMAL_DAMAGE,
      });
    }
  }

  private spawnDiagonalVolley(
    ctx: CharacterActionContext,
    fighter: FighterState,
    angle: number,
    frameDelay: number,
  ): void {
    for (const side of [-1, 1]) {
      const shotAngle =
        angle + side * degreesToRadians(REISEN_NORMAL_DIAGONAL_DEGREES);
      this.spawnOrb(ctx, fighter, {
        x: fighter.x,
        y: fighter.y,
        angle: shotAngle,
        speedRank: REISEN_NORMAL_DIAGONAL_SPEED,
        textureKey: "bullet_type_8_offset_3",
        frameDelay,
        damage: REISEN_NORMAL_DAMAGE,
        expireTicks: REISEN_NORMAL_SPLIT_DELAY_TICKS,
      });
      this.spawnSplitPair(ctx, fighter, shotAngle, frameDelay);
    }
  }

  private spawnSplitPair(
    ctx: CharacterActionContext,
    fighter: FighterState,
    sourceAngle: number,
    frameDelay: number,
  ): void {
    const speed = bulletSpeedRankToPixelsPerTick(REISEN_NORMAL_DIAGONAL_SPEED);
    const splitX =
      fighter.x +
      Math.cos(sourceAngle) * speed * REISEN_NORMAL_SPLIT_DELAY_TICKS;
    const splitY =
      fighter.y +
      Math.sin(sourceAngle) * speed * REISEN_NORMAL_SPLIT_DELAY_TICKS;
    for (const side of [-1, 1]) {
      this.spawnOrb(ctx, fighter, {
        x: splitX,
        y: splitY,
        angle:
          sourceAngle + side * degreesToRadians(REISEN_NORMAL_SPLIT_DEGREES),
        speedRank: REISEN_NORMAL_SPLIT_SPEED,
        textureKey: "bullet_type_8_offset_1",
        frameDelay: frameDelay + REISEN_NORMAL_SPLIT_DELAY_TICKS,
        damage: REISEN_NORMAL_SPLIT_DAMAGE,
      });
    }
  }

  private spawnOrb(
    ctx: CharacterActionContext,
    fighter: FighterState,
    params: {
      readonly x: number;
      readonly y: number;
      readonly angle: number;
      readonly speedRank: "low" | "medium" | "high";
      readonly textureKey: string;
      readonly frameDelay: number;
      readonly damage: number;
      readonly expireTicks?: number;
    },
  ): void {
    ctx.spawnBullet({
      owner: fighter.key,
      textureKey: params.textureKey,
      kind: "orb",
      x: params.x,
      y: params.y,
      angle: normalizeAngle(params.angle),
      speedRank: params.speedRank,
      width: REISEN_NORMAL_BULLET_SIZE,
      height: REISEN_NORMAL_BULLET_SIZE,
      homingTicks: 0,
      damage: params.damage,
      spawnOffset: 0,
      frame: ctx.frame + params.frameDelay,
      expireTicks: params.expireTicks,
      couldClear: true,
    });
  }
}

Vanilla.registerCharacter("reisen")(ReisenBattleCharacter);

function degreesToRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

function normalizeAngle(angle: number): number {
  const fullCircle = degreesToRadians(FULL_CIRCLE_DEGREES);
  return Math.atan2(Math.sin(angle), Math.cos(angle)) % fullCircle;
}
