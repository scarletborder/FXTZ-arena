import {
  ARENA_HEIGHT,
  ARENA_WIDTH,
  PLAYER_CORE_RADIUS,
  YOUMU_BOMB_DASH_DISTANCE,
} from "@repo/constants";
import { fp } from "@shaisrc/fixed-point";

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
import { fpAtan2 } from "../fp";

const ARC_SEGMENTS = 8;
const CLEAR_DAMAGE = 0;
const SLASH_DAMAGE = 2;
const SLASH_DURATION_TICKS = 20;
const SLASH_TEXTURE_KEY = "effect_youmu_slash";
const SLASH_ARC_INTERVAL = 4;

const NORMALSHOOT_DAMAGE = 35;
const BOMBSHOT_DAMAGE = 40;

const REAR_BULLET_SIZE = 12;
const SLASH_DISTANCE_TIER1 = hitCircleUnits(12);
const SLASH_DISTANCE_TIER1_GAP = hitCircleUnits(8);
const SLASH_DISTANCE_TIER3 = hitCircleUnits(32);
const SLASH_DISTANCE_TIER4 = hitCircleUnits(14);

const SLASH_MIN_RADIUS = hitCircleUnits(24);
const SLASH_MAX_RADIUS = hitCircleUnits(28);
const BOMB_DASH_DISTANCE = YOUMU_BOMB_DASH_DISTANCE;
const BOMB_SHOT_COUNT = 6;
const BOMB_SHOT_INTERVAL = 5;
const YOUMU_BOMB_STARTUP_TICKS = secondsToTicks(0.2);

export class YoumuBattleCharacter extends BattleCharacter {
  readonly id = "youmu" as CharacterDefinition["id"];
  readonly name = "魂魄妖梦";
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
    "· 无敌的半灵剑客\n· 高速斩击具有高伤害和清除弹幕能力\n· bomb可进行高速冲刺";
  readonly gallery: CharacterGalleryAssets = {
    portraitAsset: "assets/characters/youmu/portrait.png",
    attackPreviewAsset: "assets/characters/youmu/preview.png",
    combatAsset: "assets/characters/youmu/combat.png",
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

    let slashIndex = 0;
    this.spawnSlashArc(ctx, fighter, {
      slashIndex,
      baseAngle: angle,
      slashDistance: SLASH_DISTANCE_TIER1,
      slashSide: "front",
      startOffset: Math.PI / 9,
      endOffset: Math.PI / 3,
      frame: ctx.frame + slashIndex * SLASH_ARC_INTERVAL,
    });
    slashIndex += 1;
    this.spawnSlashArc(ctx, fighter, {
      slashIndex,
      baseAngle: angle,
      slashDistance: SLASH_DISTANCE_TIER1 + SLASH_DISTANCE_TIER1_GAP,
      slashSide: "front",
      startOffset: -Math.PI / 9,
      endOffset: -Math.PI / 3,
      frame: ctx.frame + slashIndex * SLASH_ARC_INTERVAL,
    });
    slashIndex += 1;
    if (tier >= 3) {
      this.spawnSlashArc(ctx, fighter, {
        slashIndex,
        baseAngle: angle,
        slashDistance: SLASH_DISTANCE_TIER3,
        slashSide: "front",
        startOffset: (-Math.PI * 2) / 9,
        endOffset: (Math.PI * 2) / 9,
        frame: ctx.frame + slashIndex * SLASH_ARC_INTERVAL,
      });
      slashIndex += 1;
    }
    if (tier >= 4) {
      this.spawnSlashArc(ctx, fighter, {
        slashIndex,
        baseAngle: angle,
        slashDistance: SLASH_DISTANCE_TIER4,
        slashSide: "back",
        startOffset: -Math.PI / 9,
        endOffset: Math.PI / 9,
        frame: ctx.frame + slashIndex * SLASH_ARC_INTERVAL,
      });
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
    fighter.youmuBombDashDelayRemaining = YOUMU_BOMB_STARTUP_TICKS;
    fighter.youmuBombDashStartX = fighter.x;
    fighter.youmuBombDashStartY = fighter.y;
    fighter.youmuBombDashAimX = aimX;
    fighter.youmuBombDashAimY = aimY;
    const startupLockTicks = YOUMU_BOMB_STARTUP_TICKS + 1;
    fighter.actionLockedUntil = Math.max(
      fighter.actionLockedUntil,
      startupLockTicks,
    );
    fighter.switchLockedUntil = Math.max(
      fighter.switchLockedUntil,
      startupLockTicks,
    );
    fighter.movementLockedUntil = Math.max(
      fighter.movementLockedUntil,
      startupLockTicks,
    );
  }

  onPostUpdate(ctx: CharacterActionContext, fighter: FighterState): void {
    if (fighter.youmuBombDashDelayRemaining !== 0) {
      return;
    }
    if (
      fighter.youmuBombDashStartX === undefined ||
      fighter.youmuBombDashStartY === undefined ||
      fighter.youmuBombDashAimX === undefined ||
      fighter.youmuBombDashAimY === undefined
    ) {
      return;
    }

    const startX = fighter.youmuBombDashStartX;
    const startY = fighter.youmuBombDashStartY;
    const aimX = fighter.youmuBombDashAimX;
    const aimY = fighter.youmuBombDashAimY;
    fighter.youmuBombDashStartX = undefined;
    fighter.youmuBombDashStartY = undefined;
    fighter.youmuBombDashAimX = undefined;
    fighter.youmuBombDashAimY = undefined;
    this.executeDashBomb(ctx, fighter, startX, startY, aimX, aimY);
  }

  private executeDashBomb(
    ctx: CharacterActionContext,
    fighter: FighterState,
    startX: number,
    startY: number,
    aimX: number,
    aimY: number,
  ): void {
    const destination = dashDestination(startX, startY, aimX, aimY);
    const dashLength = Math.hypot(
      destination.x - startX,
      destination.y - startY,
    );

    fighter.x = destination.x;
    fighter.y = destination.y;

    if (dashLength > 0) {
      ctx.spawnSegment({
        owner: fighter.key,
        textureKey: "effect_youmu_dash_path",
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
    params: {
      readonly slashIndex: number;
      readonly baseAngle: number;
      readonly slashDistance: number;
      readonly slashSide: "front" | "back";
      readonly startOffset: number;
      readonly endOffset: number;
      readonly frame: number;
    },
  ): void {
    const ringCenterDistance = SLASH_MIN_RADIUS - params.slashDistance;
    const slashAngle =
      params.slashSide === "front"
        ? params.baseAngle
        : params.baseAngle + Math.PI;
    const ringCenterAngle = slashAngle + Math.PI;
    const fpRingCenter = fp.fromFloat(ringCenterAngle);
    const fpRingDist = fp.fromFloat(ringCenterDistance);
    const ringCenterX =
      fighter.x + fp.toFloat(fp.mul(fp.cos(fpRingCenter), fpRingDist));
    const ringCenterY =
      fighter.y + fp.toFloat(fp.mul(fp.sin(fpRingCenter), fpRingDist));
    const centerlineRadius = (SLASH_MIN_RADIUS + SLASH_MAX_RADIUS) / 2;
    const ringWidth = SLASH_MAX_RADIUS - SLASH_MIN_RADIUS;
    const step = (params.endOffset - params.startOffset) / ARC_SEGMENTS;
    for (let index = 0; index < ARC_SEGMENTS; index += 1) {
      const offset = params.startOffset + step * (index + 0.5);
      const segmentAngle = slashAngle + offset;
      const fpSegAngle = fp.fromFloat(segmentAngle);
      const fpCLRadius = fp.fromFloat(centerlineRadius);
      ctx.spawnLaser({
        owner: fighter.key,
        textureKey: `${SLASH_TEXTURE_KEY}:${params.slashIndex}:${index}:${ARC_SEGMENTS}`,
        x: ringCenterX + fp.toFloat(fp.mul(fp.cos(fpSegAngle), fpCLRadius)),
        y: ringCenterY + fp.toFloat(fp.mul(fp.sin(fpSegAngle), fpCLRadius)),
        angle: segmentAngle + Math.PI / 2,
        initialLength: Math.max(ringWidth, Math.abs(step) * centerlineRadius),
        maxLength: Math.max(ringWidth, Math.abs(step) * centerlineRadius),
        lengthGrowthPerTick: 0,
        height: ringWidth,
        speedRank: "low",
        expireTicks: SLASH_DURATION_TICKS,
        damage: SLASH_DAMAGE,
        spawnOffset: 0,
        pinned: true,
        frame: params.frame,
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
      textureKey: "bullet_type_4_offset_9",
      kind: "knife",
      x: position.x,
      y: position.y,
      angle: aimAngle,
      speedRank: "high",
      width: REAR_BULLET_SIZE,
      height: REAR_BULLET_SIZE,
      homingTicks: 0,
      damage: NORMALSHOOT_DAMAGE,
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
      textureKey: "bullet_type_4_offset_9",
      kind: "orb",
      x,
      y,
      angle: fpAtan2(
        fp.fromFloat(ctx.opponent.y - y),
        fp.fromFloat(ctx.opponent.x - x),
      ),
      speedRank: "high",
      width: REAR_BULLET_SIZE,
      height: REAR_BULLET_SIZE,
      homingTicks: 0,
      damage: BOMBSHOT_DAMAGE,
      frame,
      couldClear: true,
    });
  }
}

Vanilla.registerCharacter("youmu")(YoumuBattleCharacter);

function dashDestination(
  fighterX: number,
  fighterY: number,
  aimX: number,
  aimY: number,
): { readonly x: number; readonly y: number } {
  const dx = aimX - fighterX;
  const dy = aimY - fighterY;
  const distance = Math.hypot(dx, dy);
  if (distance === 0) {
    return { x: fighterX, y: fighterY };
  }
  const dashDistance = Math.min(distance, BOMB_DASH_DISTANCE);
  const ratio = dashDistance / distance;
  return {
    x: clamp(
      fighterX + dx * ratio,
      PLAYER_CORE_RADIUS,
      ARENA_WIDTH - PLAYER_CORE_RADIUS,
    ),
    y: clamp(
      fighterY + dy * ratio,
      PLAYER_CORE_RADIUS,
      ARENA_HEIGHT - PLAYER_CORE_RADIUS,
    ),
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
