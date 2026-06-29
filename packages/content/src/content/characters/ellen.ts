import {
  bulletSpeedRankToPixelsPerTick,
  TICK_RATE,
} from "@repo/types";
import { fp } from "@shaisrc/fixed-point";
import { HIT_CIRCLE_DIAMETER } from "@repo/constants";

import type { CharacterDefinition, CharacterGalleryAssets } from "./types";

import type { FighterState } from "../battle-types";
import type { BattleHitContext } from "../ability-cards/base";
import {
  BattleCharacter,
  DEFAULT_POINT_COLLECT_RADIUS,
  secondsToTicks,
  type CharacterActionContext,
} from "./base";
import { Vanilla } from "../decorators";

const CENTER_PAIR_GAP = hitCircleUnitsFixed(4);
const CENTER_SHOT_INTERVAL = 8;
const CENTER_BULLET_SIZE = scaledHitbox(24, 11, 32);
const SIDE_BULLET_SIZE = scaledHitbox(36, 15, 32);
const BOMB_BULLET_SIZE = scaledHitbox(48, 38, 64);

const CENTER_DAMAGE_BY_TIER = {
  1: 50,
  2: 50,
  3: 40,
  4: 40,
} as const;
const FORWARD_SIDE_DAMAGE_BY_TIER = {
  1: 10,
  2: 8,
  3: 8,
  4: 8,
} as const;
const BACK_SIDE_DAMAGE_BY_TIER = {
  1: 5,
  2: 5,
  3: 5,
  4: 5,
} as const;
const BOMB_FRAME_DAMAGE = 1;

const FP_PI = fp.fromFloat(Math.PI);
const FP_TWO_PI = fp.mul(FP_PI, fp.fromInt(2));
const FP_DEGREES_TO_RADIANS = fp.div(FP_PI, fp.fromInt(180));
const CENTER_HALF_GAP = fp.div(fp.fromFloat(CENTER_PAIR_GAP), fp.fromInt(2));
const TIER1_SIDE_ANGLES = [20, 45, 60] as const;
const TIER2_SIDE_ANGLES = [10, 30, 55] as const;
const TIER3_SIDE_ANGLES = [20, 50] as const;
const TIER4_SIDE_ANGLES = [10, 40, 65] as const;
const BOMB_SHOT_COUNT = 3;
const BOMB_SHOT_SPACING = fp.div(FP_TWO_PI, fp.fromInt(BOMB_SHOT_COUNT));
const BOMB_BULLET_EXPIRE_TICKS = secondsToTicks(4);
const SIDE_RETARGET_SPEED = bulletSpeedRankToPixelsPerTick("high");

export class EllenBattleCharacter extends BattleCharacter {
  readonly id = "ellen" as CharacterDefinition["id"];
  readonly name = "content.characters.ellen.name";
  readonly cost = 5;
  readonly roleClass = "sniper" as CharacterDefinition["roleClass"];
  readonly moveSpeed = "low" as CharacterDefinition["moveSpeed"];
  readonly fireRate = "low" as CharacterDefinition["fireRate"];
  readonly ammoCapacity = 3;
  readonly reloadTicksPerAmmo = secondsToTicks(1.5);
  readonly reloadStartPolicy =
    "keep_current" as CharacterDefinition["reloadStartPolicy"];
  readonly reloadCommitPolicy =
    "commit_per_ammo" as CharacterDefinition["reloadCommitPolicy"];
  readonly bulletSpeed = "high" as CharacterDefinition["bulletSpeed"];
  readonly description = "content.characters.ellen.description";
  readonly gallery: CharacterGalleryAssets = {
    portraitAsset: "assets/characters/ellen/portrait.png",
    attackPreviewAsset: "assets/characters/ellen/preview.png",
    combatAsset: "assets/characters/ellen/combat.png",
  };
  readonly normalAttackId = "ellen_delayed_snipe";
  readonly bombId = "ellen_spiral_bomb";
  readonly pointCollectRadius = DEFAULT_POINT_COLLECT_RADIUS;

  shoot(
    ctx: CharacterActionContext,
    fighter: FighterState,
    aimX: number,
    aimY: number,
  ): void {
    void aimX;
    void aimY;
    const angle = fighter.facing;
    const tier = this.pointPowerTier(fighter);
    const centerRepeats = tier >= 3 ? 2 : 1;

    for (let repeat = 0; repeat < centerRepeats; repeat += 1) {
      this.spawnCenterPair(
        ctx,
        fighter,
        angle,
        ctx.frame + repeat * CENTER_SHOT_INTERVAL,
        CENTER_DAMAGE_BY_TIER[tier],
      );
    }

    this.spawnRetargetFan(
      ctx,
      fighter,
      angle,
      TIER1_SIDE_ANGLES,
      secondsToTicks(1),
      "bullet_type_24_offset_1",
      SIDE_BULLET_SIZE,
      FORWARD_SIDE_DAMAGE_BY_TIER[tier],
    );

    if (tier >= 2) {
      this.spawnRetargetFan(
        ctx,
        fighter,
        angle,
        TIER2_SIDE_ANGLES,
        secondsToTicks(1.2),
        "bullet_type_24_offset_1",
        SIDE_BULLET_SIZE,
        FORWARD_SIDE_DAMAGE_BY_TIER[tier],
      );
    }

    if (tier >= 3) {
      this.spawnRetargetFan(
        ctx,
        fighter,
        fp.toFloat(fp.add(fp.fromFloat(angle), FP_PI)),
        [...TIER3_SIDE_ANGLES],
        secondsToTicks(0.8),
        "bullet_type_24_offset_1",
        SIDE_BULLET_SIZE,
        BACK_SIDE_DAMAGE_BY_TIER[tier],
      );
    }

    if (tier >= 4) {
      this.spawnRetargetFan(
        ctx,
        fighter,
        fp.toFloat(fp.add(fp.fromFloat(angle), FP_PI)),
        [...TIER4_SIDE_ANGLES],
        secondsToTicks(0.8),
        "bullet_type_24_offset_1",
        SIDE_BULLET_SIZE,
        BACK_SIDE_DAMAGE_BY_TIER[tier],
      );
    }
  }

  useBomb(ctx: CharacterActionContext, fighter: FighterState): void {
    this.startBomb(ctx, fighter);
    const duration = secondsToTicks(1);
    const radius = this.clearProjectiles(ctx, fighter, 28, duration);
    this.spawnClearRing(ctx, fighter, radius, 0xd8b7ff, duration);

    const radialSpeed = bulletSpeedRankToPixelsPerTick("low");
    const angularSpeed = fp.div(FP_TWO_PI, fp.fromInt(TICK_RATE));
    for (let index = 0; index < BOMB_SHOT_COUNT; index += 1) {
      this.spawnBombBullet(
        ctx,
        fighter,
        fp.toFloat(
          fp.add(
            fp.fromFloat(fighter.facing),
            fp.mul(BOMB_SHOT_SPACING, fp.fromInt(index)),
          ),
        ),
        radialSpeed,
        fp.toFloat(angularSpeed),
      );
    }
  }

  onHit(_ctx: BattleHitContext): void {
    // Ellen has no hit-time modifier by default.
  }

  private spawnCenterPair(
    ctx: CharacterActionContext,
    fighter: FighterState,
    angle: number,
    frame: number,
    damage: number,
  ): void {
    for (const side of [-1, 1]) {
      const position = this.offsetPosition(
        fighter.x,
        fighter.y,
        angle,
        0,
        fp.toFloat(fp.mul(CENTER_HALF_GAP, fp.fromInt(side))),
      );
      ctx.spawnBullet({
        owner: fighter.key,
        textureKey: "bullet_type_21_offset_1",
        kind: "orb",
        x: position.x,
        y: position.y,
        angle,
        speedRank: "high",
        width: CENTER_BULLET_SIZE.width,
        height: CENTER_BULLET_SIZE.height,
        homingTicks: 0,
        damage,
        spawnOffset: 0,
        frame,
        couldClear: true,
      });
    }
  }

  private spawnRetargetFan(
    ctx: CharacterActionContext,
    fighter: FighterState,
    baseAngle: number,
    angleDegrees: readonly number[],
    retargetDelay: number,
    textureKey: string,
    size: { readonly width: number; readonly height: number },
    damage: number,
  ): void {
    for (const degrees of angleDegrees) {
      const offset = degreesToRadians(degrees);
      this.spawnRetargetBullet(
        ctx,
        fighter,
        fp.toFloat(fp.sub(fp.fromFloat(baseAngle), fp.fromFloat(offset))),
        retargetDelay,
        textureKey,
        size,
        damage,
      );
      this.spawnRetargetBullet(
        ctx,
        fighter,
        fp.toFloat(fp.add(fp.fromFloat(baseAngle), fp.fromFloat(offset))),
        retargetDelay,
        textureKey,
        size,
        damage,
      );
    }
  }

  private spawnRetargetBullet(
    ctx: CharacterActionContext,
    fighter: FighterState,
    angle: number,
    retargetDelay: number,
    textureKey: string,
    size: { readonly width: number; readonly height: number },
    damage: number,
  ): void {
    ctx.spawnBullet({
      owner: fighter.key,
      textureKey,
      kind: "orb",
      x: fighter.x,
      y: fighter.y,
      angle,
      speedRank: "low",
      width: size.width,
      height: size.height,
      homingTicks: 0,
      damage,
      spawnOffset: 0,
      retargetAt: ctx.frame + retargetDelay,
      retargetSpeed: SIDE_RETARGET_SPEED,
      couldClear: true,
    });
  }

  private spawnBombBullet(
    ctx: CharacterActionContext,
    fighter: FighterState,
    angle: number,
    radialSpeed: number,
    angularSpeed: number,
  ): void {
    ctx.spawnBullet({
      owner: fighter.key,
      textureKey: "bullet_type_23_offset_1",
      kind: "orb",
      x: fighter.x,
      y: fighter.y,
      angle,
      speedRank: "low",
      width: BOMB_BULLET_SIZE.width,
      height: BOMB_BULLET_SIZE.height,
      homingTicks: 0,
      damage: BOMB_FRAME_DAMAGE,
      spawnOffset: 0,
      expireTicks: BOMB_BULLET_EXPIRE_TICKS,
      couldClear: true,
      piercesTargets: true,
      polarOriginX: fighter.x,
      polarOriginY: fighter.y,
      polarRadius: 0,
      polarAngle: angle,
      polarRadialSpeed: radialSpeed,
      polarAngularSpeed: angularSpeed,
    });
  }
}

Vanilla.registerCharacter("ellen")(EllenBattleCharacter);

function degreesToRadians(degrees: number): number {
  return fp.toFloat(fp.mul(FP_DEGREES_TO_RADIANS, fp.fromInt(degrees)));
}

function scaledHitbox(
  baseSize: number,
  hitboxSize: number,
  rectSize: number,
): { readonly width: number; readonly height: number } {
  const size = fp.toFloat(
    fp.mul(
      fp.fromFloat(baseSize),
      fp.div(fp.fromFloat(hitboxSize), fp.fromFloat(rectSize)),
    ),
  );
  return { width: size, height: size };
}

function hitCircleUnitsFixed(multiplier: number): number {
  return fp.toFloat(
    fp.mul(fp.fromFloat(HIT_CIRCLE_DIAMETER), fp.fromFloat(multiplier)),
  );
}
