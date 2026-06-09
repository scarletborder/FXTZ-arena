import { fp } from "@shaisrc/fixed-point";
import { DEFAULT_ARENA_BOUNDS, type ArenaBounds } from "@repo/constants";
import type { PointRewardSize } from "@repo/constants";
import {
  NeutralMob,
  type NeutralMobActionContext,
  type NeutralMobDeathSource,
  type NeutralMobState,
} from "@repo/types";

import { FP_0, FP_PI, FP_PI_2 } from "../../fp";
import {
  hitCircleUnits,
  secondsToTicks,
  type BattleBulletSpawnParams,
  type BattleLaserSpawnParams,
} from "../../characters/base";

export type HorizontalFairyMovementVariant = "left_to_right" | "right_to_left";

export interface HorizontalFairyState extends NeutralMobState {
  readonly kind: "horizontal_fairy";
  movementVariant: HorizontalFairyMovementVariant;
  /** ageTicks at which the next volley fires, or -1 if none is scheduled. */
  nextFireAge: number;
  /** 0 = cardinal directions, 1 = diagonal directions. */
  fireSubphase: number;
}

type BoundedMobActionContext = NeutralMobActionContext<
  BattleBulletSpawnParams,
  BattleLaserSpawnParams
> & {
  readonly arenaBounds: ArenaBounds;
};

const MAX_HEALTH = 50;
const HIT_RADIUS = 36;
const START_FIRE_TICKS = secondsToTicks(1.2);
const FIRE_INTERVAL_TICKS = secondsToTicks(1.1);

/** Total ticks to cross the arena at low speed. */
const TOTAL_TICKS = secondsToTicks(12);

/** Precomputed diagonal angles in fixed-point. */
const ANGLE_DOWN_RIGHT = fp.fromFloat(Math.PI / 4);
const ANGLE_DOWN_LEFT = fp.fromFloat((3 * Math.PI) / 4);
const ANGLE_UP_LEFT = fp.fromFloat((-3 * Math.PI) / 4);
const ANGLE_UP_RIGHT = fp.fromFloat(-Math.PI / 4);

function startPos(
  variant: HorizontalFairyMovementVariant,
  bounds: ArenaBounds,
): { readonly x: number; readonly y: number } {
  return variant === "left_to_right"
    ? { x: -hitCircleUnits(12), y: bounds.height - 60 }
    : { x: bounds.width + hitCircleUnits(12), y: bounds.height - 60 };
}

function endPos(
  variant: HorizontalFairyMovementVariant,
  bounds: ArenaBounds,
): { readonly x: number; readonly y: number } {
  return variant === "left_to_right"
    ? { x: bounds.width + hitCircleUnits(12), y: 60 }
    : { x: -hitCircleUnits(12), y: 60 };
}

export class HorizontalFairy extends NeutralMob<
  HorizontalFairyState,
  BattleBulletSpawnParams,
  BattleLaserSpawnParams
> {
  readonly state: HorizontalFairyState;

  constructor(params: {
    readonly id: number;
    readonly waveId: number;
    readonly movementVariant: HorizontalFairyMovementVariant;
    readonly pointRewardSize?: PointRewardSize;
    readonly arenaBounds?: ArenaBounds;
  }) {
    super();
    const start = startPos(
      params.movementVariant,
      params.arenaBounds ?? DEFAULT_ARENA_BOUNDS,
    );
    this.state = {
      id: params.id,
      key: "Neutral",
      kind: "horizontal_fairy",
      textureKey: "enemy_type_2",
      x: start.x,
      y: start.y,
      previousX: start.x,
      previousY: start.y,
      hitRadius: HIT_RADIUS,
      waveId: params.waveId,
      movementVariant: params.movementVariant,
      form: "move",
      MaxHealth: MAX_HEALTH,
      CurrentHealth: MAX_HEALTH,
      pointRewardSize: params.pointRewardSize,
      active: true,
      ageTicks: 0,
      nextFireAge: START_FIRE_TICKS,
      fireSubphase: 0,
      sfxFlags: 0,
    };
  }

  static fromSnapshot(snapshot: NeutralMobState): HorizontalFairy {
    const s = snapshot as HorizontalFairyState;
    const mob = new HorizontalFairy({
      id: s.id,
      waveId: s.waveId,
      movementVariant:
        s.movementVariant === "right_to_left"
          ? "right_to_left"
          : "left_to_right",
    });
    mob.restore(s);
    return mob;
  }

  onDeathEffect(): void {
    // No-op for HorizontalFairy.
  }

  onDeath(_source: NeutralMobDeathSource): void {
    // Rewards are handled via pointRewardSize.
  }

  move(ctx: BoundedMobActionContext): void {
    const start = startPos(this.state.movementVariant, ctx.arenaBounds);
    const end = endPos(this.state.movementVariant, ctx.arenaBounds);
    const t = ratio(this.state.ageTicks, TOTAL_TICKS);
    this.state.x = lerp(start.x, end.x, t);
    this.state.y = lerp(start.y, end.y, t);
    this.state.form = "move";
  }

  fire(
    ctx: NeutralMobActionContext<
      BattleBulletSpawnParams,
      BattleLaserSpawnParams
    >,
  ): void {
    if (this.state.ageTicks < this.state.nextFireAge) {
      return;
    }

    // Subphase 0: cardinal directions (up, down, left, right)
    // Subphase 1: diagonal directions
    const angles: readonly number[] =
      this.state.fireSubphase === 0
        ? [FP_0, FP_PI_2, FP_PI, fp.negate(FP_PI_2)]
        : [ANGLE_DOWN_RIGHT, ANGLE_DOWN_LEFT, ANGLE_UP_LEFT, ANGLE_UP_RIGHT];

    for (const angle of angles) {
      ctx.spawnBullet({
        owner: "Neutral",
        textureKey: "bullet_type_21_offset_1",
        kind: "orb",
        x: this.state.x,
        y: this.state.y,
        angle: fp.toFloat(angle as number),
        speedRank: "low",
        width: 15,
        height: 15,
        homingTicks: 0,
        spawnOffset: 0,
      });
    }

    // Toggle subphase and schedule next volley
    this.state.fireSubphase = this.state.fireSubphase === 0 ? 1 : 0;
    this.state.nextFireAge = this.state.ageTicks + FIRE_INTERVAL_TICKS;
  }

  switchForm(): void {
    // No form changes for HorizontalFairy.
  }

  die(): void {
    if (this.state.CurrentHealth <= 0 || this.state.ageTicks >= TOTAL_TICKS) {
      this.state.active = false;
    }
  }

  onProjectileHit(damage: number): "accepted" | "ignored" {
    if (!this.state.active || damage <= 0) {
      return "ignored";
    }
    this.state.CurrentHealth = Math.max(0, this.state.CurrentHealth - damage);
    if (this.state.CurrentHealth <= 0) {
      this.state.active = false;
    }
    return "accepted";
  }
}

function ratio(ticks: number, duration: number): number {
  return fp.div(
    fp.fromInt(Math.max(0, Math.min(ticks, duration))),
    fp.fromInt(duration),
  );
}

function lerp(start: number, end: number, t: number): number {
  return fp.toFloat(
    fp.add(fp.fromFloat(start), fp.mul(fp.fromFloat(end - start), t)),
  );
}
