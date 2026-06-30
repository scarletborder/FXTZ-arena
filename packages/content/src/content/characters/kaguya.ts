import { bulletSpeedRankToPixelsPerTick } from "@repo/types";
import { fp } from "@shaisrc/fixed-point";
import { fpAtan2 } from "../fp";

import type { CharacterDefinition, CharacterGalleryAssets } from "./types";

import type { FighterKey, FighterState } from "../battle-types";
import type { BattleHitContext } from "../ability-cards/base";
import {
  BattleCharacter,
  DEFAULT_POINT_COLLECT_RADIUS,
  type BattleBulletSpawnParams,
  type BattleLaserSpawnParams,
  hitCircleUnits,
  secondsToTicks,
  type CharacterActionContext,
  type PointPowerTier,
} from "./base";
import {
  createDefaultFamiliarClass,
  createDefaultFamiliarState,
  type DefaultFamiliarState,
} from "./default-familiar";
import { Vanilla } from "../decorators";

export const KAGUYA_COST = 4;
export const KAGUYA_AMMO_CAPACITY = 1;
export const KAGUYA_RELOAD_TICKS_PER_AMMO = secondsToTicks(2.2);
export const KAGUYA_NORMAL_BULLET_SIZE = 42;
export const KAGUYA_NORMAL_ORBIT_RADIUS = 64;
export const KAGUYA_NORMAL_ORBIT_DELAY_TICKS = secondsToTicks(1.5);
export const KAGUYA_NORMAL_INITIAL_SIDE_DEGREES = 90;
export const KAGUYA_NORMAL_DAMAGE_BY_TIER: Record<PointPowerTier, number> = {
  1: 70,
  2: 60,
  3: 45,
  4: 35,
};
export const KAGUYA_NORMAL_ANGULAR_SPEED =
  (Math.PI * 2) / KAGUYA_NORMAL_ORBIT_DELAY_TICKS;
export const KAGUYA_NORMAL_RETARGET_SPEED =
  bulletSpeedRankToPixelsPerTick("high");
export const KAGUYA_NORMAL_TIER_COUNTS: Record<PointPowerTier, number> = {
  1: 2,
  2: 3,
  3: 5,
  4: 9,
};

export const KAGUYA_BOMB_WARNING_TICKS = secondsToTicks(0.8);
export const KAGUYA_BOMB_SIDE_HIT_CIRCLE_MULTIPLIER = 128;
export const KAGUYA_BOMB_EXTENSION_HIT_CIRCLE_MULTIPLIER = 24;
export const KAGUYA_BOMB_BULLET_SIZE = 24;
export const KAGUYA_BOMB_SHOT_INTERVAL_FRAMES = 16;
export const KAGUYA_BOMB_SHOTS_PER_POINT = 32;
export const KAGUYA_BOMB_LOCK_TICKS =
  KAGUYA_BOMB_WARNING_TICKS +
  KAGUYA_BOMB_SHOTS_PER_POINT * KAGUYA_BOMB_SHOT_INTERVAL_FRAMES;
export const KAGUYA_BOMB_DAMAGE = 6;
export const KAGUYA_BOMB_WARNING_HALF_WIDTH = 3;
export const KAGUYA_BOMB_FAMILIAR_HEALTH = 180;

const FULL_CIRCLE = Math.PI * 2;
const EQUILATERAL_CIRCUMRADIUS_DIVISOR = Math.sqrt(3);
const KAGUYA_BOMB_FAMILIAR_KIND = "kaguya_bomb_familiar";
const KAGUYA_BOMB_FAMILIAR_RADIUS = 20;
const KAGUYA_BOMB_FAMILIAR_BASE = createDefaultFamiliarClass(
  KAGUYA_BOMB_FAMILIAR_RADIUS,
);

export class KaguyaBattleCharacter extends BattleCharacter {
  readonly id = "kaguya" as CharacterDefinition["id"];
  readonly name = "content.characters.kaguya.name";
  readonly cost = KAGUYA_COST;
  readonly roleClass = "scout" as CharacterDefinition["roleClass"];
  readonly moveSpeed = "medium" as CharacterDefinition["moveSpeed"];
  readonly fireRate = "low" as CharacterDefinition["fireRate"];
  readonly ammoCapacity = KAGUYA_AMMO_CAPACITY;
  readonly reloadTicksPerAmmo = KAGUYA_RELOAD_TICKS_PER_AMMO;
  readonly reloadStartPolicy =
    "reset_to_zero" as CharacterDefinition["reloadStartPolicy"];
  readonly reloadCommitPolicy =
    "commit_on_finish" as CharacterDefinition["reloadCommitPolicy"];
  readonly bulletSpeed = "high" as CharacterDefinition["bulletSpeed"];
  readonly description = "content.characters.kaguya.description";
  readonly gallery: CharacterGalleryAssets = {
    portraitAsset: "assets/characters/kaguya/portrait.png",
    attackPreviewAsset: "assets/characters/kaguya/preview.png",
    combatAsset: "assets/characters/kaguya/combat.png",
  };
  readonly normalAttackId = "kaguya_orbit_snipe";
  readonly bombId = "kaguya_familiar_triangle_bomb";
  readonly pointCollectRadius = DEFAULT_POINT_COLLECT_RADIUS;

  shoot(
    ctx: CharacterActionContext,
    fighter: FighterState,
    aimX: number,
    aimY: number,
  ): void {
    const tier = this.pointPowerTier(fighter);
    const count = KAGUYA_NORMAL_TIER_COUNTS[tier];
    const firstAngle =
      tier === 1
        ? fighter.facing - degreesToRadians(KAGUYA_NORMAL_INITIAL_SIDE_DEGREES)
        : fighter.facing + Math.PI;
    const spacing = FULL_CIRCLE / count;

    for (let index = 0; index < count; index += 1) {
      this.spawnOrbitBullet(
        ctx,
        fighter,
        firstAngle + spacing * index,
        aimX,
        aimY,
        KAGUYA_NORMAL_DAMAGE_BY_TIER[tier],
      );
    }
  }

  useBomb(
    ctx: CharacterActionContext,
    fighter: FighterState,
    aimX: number,
    aimY: number,
  ): void {
    this.startBomb(ctx, fighter, KAGUYA_BOMB_LOCK_TICKS);
    fighter.switchLockedUntil = Math.max(
      fighter.switchLockedUntil,
      KAGUYA_BOMB_LOCK_TICKS,
    );
    const vertices = equilateralTriangleVertices(
      aimX,
      aimY,
      hitCircleUnits(KAGUYA_BOMB_SIDE_HIT_CIRCLE_MULTIPLIER),
    );

    for (let index = 0; index < vertices.length; index += 1) {
      const from = vertices[index]!;
      const to = vertices[(index + 1) % vertices.length]!;
      ctx.spawnSegment({
        owner: fighter.key,
        x1: from.x,
        y1: from.y,
        x2: to.x,
        y2: to.y,
        halfWidth: KAGUYA_BOMB_WARNING_HALF_WIDTH,
        renderHalfWidth: KAGUYA_BOMB_WARNING_HALF_WIDTH,
        damage: 0,
        duration: KAGUYA_BOMB_WARNING_TICKS,
        frame: ctx.frame,
        couldClear: false,
      });
      this.spawnBombFamiliar(ctx, fighter, from, vertices[(index + 2) % 3]!);
    }
  }

  onHit(_ctx: BattleHitContext): void {
    // Kaguya has no hit-time modifier by default.
  }

  private spawnOrbitBullet(
    ctx: CharacterActionContext,
    fighter: FighterState,
    polarAngle: number,
    aimX: number,
    aimY: number,
    damage: number,
  ): void {
    const fpPolar = fp.fromFloat(polarAngle);
    const fpRadius = fp.fromFloat(KAGUYA_NORMAL_ORBIT_RADIUS);
    const x = fighter.x + fp.toFloat(fp.mul(fp.cos(fpPolar), fpRadius));
    const y = fighter.y + fp.toFloat(fp.mul(fp.sin(fpPolar), fpRadius));
    ctx.spawnBullet({
      owner: fighter.key,
      kind: "orb",
      x,
      y,
      angle: polarAngle,
      speedRank: "medium",
      width: KAGUYA_NORMAL_BULLET_SIZE,
      height: KAGUYA_NORMAL_BULLET_SIZE,
      homingTicks: 0,
      damage,
      spawnOffset: 0,
      retargetAt: ctx.frame + KAGUYA_NORMAL_ORBIT_DELAY_TICKS,
      retargetSpeed: KAGUYA_NORMAL_RETARGET_SPEED,
      retargetX: aimX,
      retargetY: aimY,
      retargetAimOwner: fighter.key,
      couldClear: true,
      polarOriginX: fighter.x,
      polarOriginY: fighter.y,
      polarRadius: KAGUYA_NORMAL_ORBIT_RADIUS,
      polarAngle,
      polarRadialSpeed: 0,
      polarAngularSpeed: KAGUYA_NORMAL_ANGULAR_SPEED,
      polarFollowOwner: fighter.key,
    });
  }

  private spawnBombFamiliar(
    ctx: CharacterActionContext,
    fighter: FighterState,
    source: Point,
    target: Point,
  ): void {
    if (!ctx.spawnMob || !ctx.allocateMobId || fighter.key === "Neutral") {
      this.spawnBombLineFallback(ctx, fighter, source, target);
      return;
    }
    ctx.spawnMob(
      new KaguyaBombFamiliar(
        ctx.allocateMobId(),
        playerFighterKey(fighter.key),
        source,
        target,
        ctx.frame,
      ),
    );
  }

  private spawnBombLineFallback(
    ctx: CharacterActionContext,
    fighter: FighterState,
    source: Point,
    target: Point,
  ): void {
    const angle = fpAtan2(
      fp.fromFloat(target.y - source.y),
      fp.fromFloat(target.x - source.x),
    );
    const extension = hitCircleUnits(KAGUYA_BOMB_EXTENSION_HIT_CIRCLE_MULTIPLIER);
    const fpAngle = fp.fromFloat(angle);
    const fpExt = fp.fromFloat(extension);
    const x = source.x - fp.toFloat(fp.mul(fp.cos(fpAngle), fpExt));
    const y = source.y - fp.toFloat(fp.mul(fp.sin(fpAngle), fpExt));
    const fireAngle = angle;

    for (let shot = 0; shot < KAGUYA_BOMB_SHOTS_PER_POINT; shot += 1) {
      ctx.spawnBullet({
        owner: fighter.key,
        kind: "orb",
        x,
        y,
        angle: fireAngle,
        speedRank: "high",
        width: KAGUYA_BOMB_BULLET_SIZE,
        height: KAGUYA_BOMB_BULLET_SIZE,
        homingTicks: 0,
        damage: KAGUYA_BOMB_DAMAGE,
        spawnOffset: 0,
        frame:
          ctx.frame +
          KAGUYA_BOMB_WARNING_TICKS +
          shot * KAGUYA_BOMB_SHOT_INTERVAL_FRAMES,
        couldClear: true,
      });
    }
  }
}

Vanilla.registerCharacter("kaguya")(KaguyaBattleCharacter);

interface KaguyaBombFamiliarState
  extends DefaultFamiliarState<typeof KAGUYA_BOMB_FAMILIAR_KIND> {
  readonly sourceCharacterId: "kaguya";
  readonly fireAngle: number;
  readonly firstShotFrame: number;
  readonly expiresAtFrame: number;
  shotsFired: number;
}

class KaguyaBombFamiliar extends KAGUYA_BOMB_FAMILIAR_BASE<KaguyaBombFamiliarState> {
  constructor(
    id: number,
    owner: PlayerFighterKey,
    source: Point,
    target: Point,
    spawnFrame: number,
  ) {
    const fireAngle = fpAtan2(
      fp.fromFloat(target.y - source.y),
      fp.fromFloat(target.x - source.x),
    );
    super({
      ...createDefaultFamiliarState({
        id,
        key: owner,
        kind: KAGUYA_BOMB_FAMILIAR_KIND,
        x: source.x,
        y: source.y,
        health: KAGUYA_BOMB_FAMILIAR_HEALTH,
        radius: KAGUYA_BOMB_FAMILIAR_RADIUS,
        angle: fireAngle,
      }),
      sourceCharacterId: "kaguya",
      fireAngle,
      firstShotFrame: spawnFrame + KAGUYA_BOMB_WARNING_TICKS,
      expiresAtFrame:
        spawnFrame +
        KAGUYA_BOMB_WARNING_TICKS +
        (KAGUYA_BOMB_SHOTS_PER_POINT - 1) * KAGUYA_BOMB_SHOT_INTERVAL_FRAMES,
      shotsFired: 0,
    });
  }

  fire(
    ctx: import("@repo/types").NeutralMobActionContext<
      BattleBulletSpawnParams,
      BattleLaserSpawnParams
    >,
  ): void {
    if (ctx.frame < this.state.firstShotFrame) {
      return;
    }
    if (
      (ctx.frame - this.state.firstShotFrame) %
        KAGUYA_BOMB_SHOT_INTERVAL_FRAMES !==
      0
    ) {
      return;
    }
    if (this.state.shotsFired >= KAGUYA_BOMB_SHOTS_PER_POINT) {
      return;
    }

    const extension = hitCircleUnits(KAGUYA_BOMB_EXTENSION_HIT_CIRCLE_MULTIPLIER);
    const fpAngle = fp.fromFloat(this.state.fireAngle);
    const fpExt = fp.fromFloat(extension);
    const x =
      this.state.x - fp.toFloat(fp.mul(fp.cos(fpAngle), fpExt));
    const y =
      this.state.y - fp.toFloat(fp.mul(fp.sin(fpAngle), fpExt));

    ctx.spawnBullet({
      owner: this.state.key,
      sourceCharacterId: this.state.sourceCharacterId,
      kind: "orb",
      x,
      y,
      angle: this.state.fireAngle,
      speedRank: "high",
      width: KAGUYA_BOMB_BULLET_SIZE,
      height: KAGUYA_BOMB_BULLET_SIZE,
      homingTicks: 0,
      damage: KAGUYA_BOMB_DAMAGE,
      spawnOffset: 0,
      couldClear: true,
    });
    this.state.shotsFired += 1;
  }

  die(
    ctx: import("@repo/types").NeutralMobActionContext<
      BattleBulletSpawnParams,
      BattleLaserSpawnParams
    >,
  ): void {
    super.die(ctx);
    if (!this.state.active) {
      return;
    }
    if (
      this.state.shotsFired >= KAGUYA_BOMB_SHOTS_PER_POINT &&
      ctx.frame >= this.state.expiresAtFrame
    ) {
      this.state.active = false;
    }
  }
}

interface Point {
  readonly x: number;
  readonly y: number;
}

type PlayerFighterKey = Exclude<FighterKey, "Neutral">;

function equilateralTriangleVertices(
  centerX: number,
  centerY: number,
  sideLength: number,
): readonly [Point, Point, Point] {
  const radius = sideLength / EQUILATERAL_CIRCUMRADIUS_DIVISOR;
  const fpRadius = fp.fromFloat(radius);
  return [0, 1, 2].map((index) => {
    const angle = -Math.PI / 2 + (FULL_CIRCLE * index) / 3;
    const fpAngle = fp.fromFloat(angle);
    return {
      x: centerX + fp.toFloat(fp.mul(fp.cos(fpAngle), fpRadius)),
      y: centerY + fp.toFloat(fp.mul(fp.sin(fpAngle), fpRadius)),
    };
  }) as [Point, Point, Point];
}

function degreesToRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

function playerFighterKey(key: FighterKey): PlayerFighterKey {
  if (key === "Neutral") {
    throw new Error("Kaguya bomb familiar must belong to a player");
  }
  return key;
}
