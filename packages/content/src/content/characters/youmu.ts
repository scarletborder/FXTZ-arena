import {
  ARENA_HEIGHT,
  ARENA_WIDTH,
  PLAYER_CORE_RADIUS,
  YOUMU_BOMB_DASH_DISTANCE,
} from "@repo/constants";

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

const ARC_SEGMENTS = 8;
const CLEAR_DAMAGE = 0;
const SLASH_DAMAGE = 5;
const REAR_BULLET_SIZE = hitCircleUnits(2);
const SLASH_DISTANCE_TIER1 = hitCircleUnits(12);
const SLASH_DISTANCE_TIER1_GAP = hitCircleUnits(8);
const SLASH_DISTANCE_TIER3 = hitCircleUnits(32);
const SLASH_DISTANCE_TIER4 = hitCircleUnits(14);
const SLASH_MIN_RADIUS = hitCircleUnits(16);
const SLASH_MAX_RADIUS = hitCircleUnits(18);
const BOMB_DASH_DISTANCE = YOUMU_BOMB_DASH_DISTANCE;
const BOMB_SHOT_COUNT = 6;
const BOMB_SHOT_INTERVAL = 5;

@Vanilla.RegisterCharacter("youmu")
export class YoumuBattleCharacter extends BattleCharacter {
  readonly id = "youmu" as CharacterDefinition["id"];
  readonly name = "Youmu";
  readonly cost = 5;
  readonly roleClass = "scout" as CharacterDefinition["roleClass"];
  readonly moveSpeed = "high" as CharacterDefinition["moveSpeed"];
  readonly fireRate = "low" as CharacterDefinition["fireRate"];
  readonly ammoCapacity = 1;
  readonly reloadTicksPerAmmo = secondsToTicks(1.5);
  readonly reloadStartPolicy =
    "reset_to_zero" as CharacterDefinition["reloadStartPolicy"];
  readonly reloadCommitPolicy =
    "commit_on_finish" as CharacterDefinition["reloadCommitPolicy"];
  readonly bulletSpeed = "high" as CharacterDefinition["bulletSpeed"];
  readonly description =
    "High-speed scout with crescent slash clears and a short dash bomb.";
  readonly gallery: CharacterGalleryAssets = {
    portraitAsset: "assets/characters/youmu/portrait.png",
    attackPreviewAsset: "assets/characters/youmu/attack-preview.png",
  };
  readonly normalAttackId = "youmu_slash";
  readonly bombId = "youmu_dash_bomb";
  readonly pointCollectRadius = DEFAULT_POINT_COLLECT_RADIUS;

  shoot(
    ctx: CharacterActionContext,
    fighter: FighterState,
    aimX: number,
    aimY: number,
  ): void {
    const angle = this.aimAngle(fighter, aimX, aimY);
    const tier = this.pointPowerTier(fighter);

    this.spawnSlashArc(
      ctx,
      fighter,
      angle,
      SLASH_DISTANCE_TIER1,
      "front",
      Math.PI / 9,
      Math.PI / 3,
    );
    this.spawnSlashArc(
      ctx,
      fighter,
      angle,
      SLASH_DISTANCE_TIER1 + SLASH_DISTANCE_TIER1_GAP,
      "front",
      -Math.PI / 9,
      -Math.PI / 3,
    );
    if (tier >= 3) {
      this.spawnSlashArc(
        ctx,
        fighter,
        angle,
        SLASH_DISTANCE_TIER3,
        "front",
        -Math.PI * 2 / 9,
        Math.PI * 2 / 9,
      );
    }
    if (tier >= 4) {
      this.spawnSlashArc(
        ctx,
        fighter,
        angle,
        SLASH_DISTANCE_TIER4,
        "back",
        -Math.PI / 9,
        Math.PI / 9,
      );
    }

    const rearShots = tier >= 2 ? 3 : 1;
    for (let index = 0; index < rearShots; index += 1) {
      this.spawnRearBullet(ctx, fighter, angle, ctx.frame + index * 6);
    }
  }

  useBomb(
    ctx: CharacterActionContext,
    fighter: FighterState,
    aimX: number,
    aimY: number,
  ): void {
    this.startBomb(ctx, fighter, secondsToTicks(0.5));
    const startX = fighter.x;
    const startY = fighter.y;
    const destination = dashDestination(fighter, aimX, aimY);
    const dashLength = Math.hypot(
      destination.x - startX,
      destination.y - startY,
    );

    fighter.x = destination.x;
    fighter.y = destination.y;

    if (dashLength > 0) {
      ctx.spawnSegment({
        owner: fighter.key,
        x1: startX,
        y1: startY,
        x2: destination.x,
        y2: destination.y,
        halfWidth: hitCircleUnits(12),
        duration: BOMB_SHOT_COUNT * BOMB_SHOT_INTERVAL,
        damage: CLEAR_DAMAGE,
        clearsProjectiles: true,
        couldClear: false,
      });
    }

    for (let index = 0; index < BOMB_SHOT_COUNT; index += 1) {
      const frame = ctx.frame + index * BOMB_SHOT_INTERVAL;
      this.spawnBombBullet(ctx, fighter, startX, startY, frame);
      this.spawnBombBullet(ctx, fighter, destination.x, destination.y, frame);
    }
  }

  onHit(_ctx: BattleHitContext): void {
    // Youmu has no hit-time modifier by default.
  }

  private spawnSlashArc(
    ctx: CharacterActionContext,
    fighter: FighterState,
    baseAngle: number,
    slashDistance: number,
    slashSide: "front" | "back",
    startOffset: number,
    endOffset: number,
  ): void {
    const ringCenterDistance = SLASH_MIN_RADIUS - slashDistance;
    const slashAngle = slashSide === "front" ? baseAngle : baseAngle + Math.PI;
    const ringCenterAngle = slashAngle + Math.PI;
    const ringCenterX =
      fighter.x + Math.cos(ringCenterAngle) * ringCenterDistance;
    const ringCenterY =
      fighter.y + Math.sin(ringCenterAngle) * ringCenterDistance;
    const centerlineRadius = (SLASH_MIN_RADIUS + SLASH_MAX_RADIUS) / 2;
    const ringWidth = SLASH_MAX_RADIUS - SLASH_MIN_RADIUS;
    const step = (endOffset - startOffset) / ARC_SEGMENTS;
    for (let index = 0; index < ARC_SEGMENTS; index += 1) {
      const offset = startOffset + step * (index + 0.5);
      const segmentAngle = slashAngle + offset;
      ctx.spawnLaser({
        owner: fighter.key,
        x: ringCenterX + Math.cos(segmentAngle) * centerlineRadius,
        y: ringCenterY + Math.sin(segmentAngle) * centerlineRadius,
        angle: segmentAngle + Math.PI / 2,
        initialLength: Math.max(ringWidth, Math.abs(step) * centerlineRadius),
        maxLength: Math.max(ringWidth, Math.abs(step) * centerlineRadius),
        lengthGrowthPerTick: 0,
        height: ringWidth,
        speedRank: "low",
        expireTicks: 8,
        damage: SLASH_DAMAGE,
        spawnOffset: 0,
        pinned: true,
        clearsProjectiles: true,
        couldClear: false,
      });
    }
  }

  private spawnRearBullet(
    ctx: CharacterActionContext,
    fighter: FighterState,
    aimAngle: number,
    frame: number,
  ): void {
    const position = this.offsetPosition(
      fighter.x,
      fighter.y,
      aimAngle,
      -hitCircleUnits(5),
      0,
    );
    ctx.spawnBullet({
      owner: fighter.key,
      kind: "orb",
      x: position.x,
      y: position.y,
      angle: aimAngle,
      speedRank: "high",
      width: REAR_BULLET_SIZE,
      height: REAR_BULLET_SIZE,
      homingTicks: 0,
      damage: 10,
      frame,
      couldClear: true,
    });
  }

  private spawnBombBullet(
    ctx: CharacterActionContext,
    fighter: FighterState,
    x: number,
    y: number,
    frame: number,
  ): void {
    ctx.spawnBullet({
      owner: fighter.key,
      kind: "orb",
      x,
      y,
      angle: Math.atan2(ctx.opponent.y - y, ctx.opponent.x - x),
      speedRank: "high",
      width: REAR_BULLET_SIZE,
      height: REAR_BULLET_SIZE,
      homingTicks: 0,
      damage: 10,
      frame,
      couldClear: true,
    });
  }
}

function dashDestination(
  fighter: FighterState,
  aimX: number,
  aimY: number,
): { readonly x: number; readonly y: number } {
  const dx = aimX - fighter.x;
  const dy = aimY - fighter.y;
  const distance = Math.hypot(dx, dy);
  if (distance === 0) {
    return { x: fighter.x, y: fighter.y };
  }
  const dashDistance = Math.min(distance, BOMB_DASH_DISTANCE);
  const ratio = dashDistance / distance;
  return {
    x: clamp(
      fighter.x + dx * ratio,
      PLAYER_CORE_RADIUS,
      ARENA_WIDTH - PLAYER_CORE_RADIUS,
    ),
    y: clamp(
      fighter.y + dy * ratio,
      PLAYER_CORE_RADIUS,
      ARENA_HEIGHT - PLAYER_CORE_RADIUS,
    ),
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
