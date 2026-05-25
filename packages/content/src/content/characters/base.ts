import { fp } from "@shaisrc/fixed-point";
import type { CharacterDefinition, CharacterGalleryAssets } from "./types";
import { HIT_CIRCLE_DIAMETER } from "@repo/constants";
import type { BattleActionContext as StandardBattleActionContext } from "../battle-ctx";
import { secondsToTicks } from "../seconds-to-ticks";

import type {
  EffectState,
  FighterKey,
  FighterState,
  ProjectileState,
  TrainingStats,
} from "../battle-types";
import type { BattleHitContext } from "../ability-cards/base";
import { fpAtan2, fpMax } from "../fp";

const STATUS_VISIBLE_TICKS = secondsToTicks(1.5);
const DEFAULT_POINT_BOMB_THRESHOLD = 300;
const DEFAULT_POINT_BOMB_COST = 200;

// Spawn param types matching the shapes from raid-logic's projectile system,
// defined locally so this package doesn't depend on raid-logic internals.
export interface BattleBulletSpawnParams {
  readonly owner: FighterKey;
  readonly kind: "orb" | "knife" | "spark";
  readonly x: number;
  readonly y: number;
  readonly angle: number;
  readonly speedRank: "low" | "medium" | "high";
  readonly width: number;
  readonly height: number;
  readonly homingTicks: number;
  readonly damage?: number;
  readonly spawnOffset?: number;
  readonly pausedUntil?: number;
  readonly retargetAt?: number;
  readonly frame?: number;
  readonly couldClear?: boolean;
  readonly clearsProjectiles?: boolean;
  readonly piercesTargets?: boolean;
}

export interface BattleLaserSpawnParams {
  readonly owner: FighterKey;
  readonly kind?: "laser" | "spark";
  readonly x: number;
  readonly y: number;
  readonly angle: number;
  readonly speedRank?: "low" | "medium" | "high";
  readonly width?: number;
  readonly height?: number;
  readonly expireTicks?: number;
  readonly initialLength?: number;
  readonly maxLength?: number;
  readonly lengthGrowthPerTick?: number;
  readonly damage?: number;
  readonly spawnOffset?: number;
  readonly pinned?: boolean;
  readonly anchored?: boolean;
  readonly rayLike?: boolean;
  readonly visibleFrom?: number;
  readonly pausedUntil?: number;
  readonly frame?: number;
  readonly couldClear?: boolean;
  readonly clearsProjectiles?: boolean;
  readonly piercesTargets?: boolean;
}

export interface CharacterActionContext
  extends StandardBattleActionContext<
    FighterState,
    ProjectileState,
    EffectState,
    TrainingStats,
    BattleBulletSpawnParams,
    BattleLaserSpawnParams
  > {}

export type PointPowerTier = 1 | 2 | 3 | 4;

export abstract class BattleCharacter {
  abstract readonly id: CharacterDefinition["id"];
  abstract readonly name: CharacterDefinition["name"];
  abstract readonly cost: CharacterDefinition["cost"];
  abstract readonly roleClass: CharacterDefinition["roleClass"];
  abstract readonly description: CharacterDefinition["description"];
  abstract readonly gallery: CharacterDefinition["gallery"];
  abstract readonly normalAttackId: CharacterDefinition["normalAttackId"];
  abstract readonly bombId: CharacterDefinition["bombId"];

  abstract readonly moveSpeed: CharacterDefinition["moveSpeed"];
  abstract readonly fireRate: CharacterDefinition["fireRate"];
  abstract readonly ammoCapacity: CharacterDefinition["ammoCapacity"];
  abstract readonly reloadTicksPerAmmo: CharacterDefinition["reloadTicksPerAmmo"];
  abstract readonly reloadStartPolicy: CharacterDefinition["reloadStartPolicy"];
  abstract readonly reloadCommitPolicy: CharacterDefinition["reloadCommitPolicy"];
  abstract readonly bulletSpeed: CharacterDefinition["bulletSpeed"];

  readonly pointBombThreshold = DEFAULT_POINT_BOMB_THRESHOLD;
  readonly pointBombCost = DEFAULT_POINT_BOMB_COST;

  get definition(): CharacterDefinition {
    return {
      id: this.id,
      name: this.name,
      cost: this.cost,
      roleClass: this.roleClass,
      moveSpeed: this.moveSpeed,
      ammoCapacity: this.ammoCapacity,
      reloadTicksPerAmmo: this.reloadTicksPerAmmo,
      reloadStartPolicy: this.reloadStartPolicy,
      reloadCommitPolicy: this.reloadCommitPolicy,
      fireRate: this.fireRate,
      bulletSpeed: this.bulletSpeed,
      description: this.description,
      normalAttackId: this.normalAttackId,
      bombId: this.bombId,
      gallery: this.gallery,
    };
  }

  abstract shoot(
    ctx: CharacterActionContext,
    fighter: FighterState,
    aimX: number,
    aimY: number,
  ): void;
  abstract useBomb(ctx: CharacterActionContext, fighter: FighterState): void;
  abstract onHit(ctx: BattleHitContext): void;

  canUseBomb(fighter: FighterState): boolean {
    return fighter.bombs > 0 || fighter.pointCount >= this.pointBombThreshold;
  }

  protected aimAngle(
    fighter: FighterState,
    aimX: number,
    aimY: number,
  ): number {
    return fpAtan2(
      fp.fromFloat(aimY - fighter.y),
      fp.fromFloat(aimX - fighter.x),
    );
  }

  protected angleToOpponent(
    ctx: CharacterActionContext,
    fighter: FighterState,
  ): number {
    return fpAtan2(
      fp.fromFloat(ctx.opponent.y - fighter.y),
      fp.fromFloat(ctx.opponent.x - fighter.x),
    );
  }

  protected pointPowerTier(fighter: FighterState): PointPowerTier {
    return pointPowerTier(fighter.pointCount);
  }

  protected offsetPosition(
    x: number,
    y: number,
    angle: number,
    forwardOffset: number,
    sideOffset: number,
  ): { readonly x: number; readonly y: number } {
    const fpAngle = fp.fromFloat(angle);
    const fpCos = fp.cos(fpAngle);
    const fpSin = fp.sin(fpAngle);
    const fpX = fp.fromFloat(x);
    const fpY = fp.fromFloat(y);
    const fpForward = fp.fromFloat(forwardOffset);
    const fpSide = fp.fromFloat(sideOffset);
    return {
      x: fp.toFloat(
        fp.add(
          fp.add(fpX, fp.mul(fpCos, fpForward)),
          fp.mul(fp.negate(fpSin), fpSide),
        ),
      ),
      y: fp.toFloat(
        fp.add(fp.add(fpY, fp.mul(fpSin, fpForward)), fp.mul(fpCos, fpSide)),
      ),
    };
  }

  protected startBomb(
    ctx: CharacterActionContext,
    fighter: FighterState,
    cooldownTicks = 60,
  ): void {
    if (fighter.pointCount >= this.pointBombThreshold) {
      fighter.pointCount = Math.max(0, fighter.pointCount - this.pointBombCost);
    } else {
      fighter.bombs -= 1;
    }
    fighter.bombUses += 1;
    fighter.statusVisibleUntil = ctx.frame + STATUS_VISIBLE_TICKS;
    fighter.bombCooldownUntil = cooldownTicks;
    ctx.stats.bombUses += 1;
  }

  protected setInvulnerable(fighter: FighterState, ticks: number): void {
    fighter.invulnerableUntil = Math.max(fighter.invulnerableUntil, ticks);
  }

  protected clearProjectiles(
    ctx: CharacterActionContext,
    fighter: FighterState,
    hitCircleMultiplier: number,
    duration = 1,
    followsOwner = false,
  ): number {
    const radius = hitCircleUnits(hitCircleMultiplier);
    ctx.spawnClearRingEntity({
      x: fighter.x,
      y: fighter.y,
      radius,
      duration,
      followsOwner,
    });
    return radius;
  }

  protected spawnClearRing(
    ctx: CharacterActionContext,
    fighter: FighterState,
    radius: number,
    tint: number,
    duration: number,
  ): void {
    ctx.spawnClearRing({ x: fighter.x, y: fighter.y, radius, tint, duration });
  }

  protected useSpiritStrike(
    ctx: CharacterActionContext,
    fighter: FighterState,
    tint: number,
  ): void {
    const radius = this.clearProjectiles(ctx, fighter, 4);
    this.spawnClearRing(ctx, fighter, radius, tint, 28);
  }
}

export function hitCircleUnits(multiplier: number): number {
  return HIT_CIRCLE_DIAMETER * multiplier;
}

export function pointPowerTier(pointCount: number): PointPowerTier {
  if (pointCount >= 300) return 4;
  if (pointCount >= 200) return 3;
  if (pointCount >= 100) return 2;
  return 1;
}

export { secondsToTicks };
