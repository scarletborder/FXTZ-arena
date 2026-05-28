import { fp } from "@shaisrc/fixed-point";
import { ARENA_HEIGHT, ARENA_WIDTH } from "@repo/constants";
import type { PointRewardSize } from "@repo/constants";
import { NeutralMob, type NeutralMobActionContext, type NeutralMobDeathSource, type NeutralMobState } from "@repo/types";

import { fpAtan2 } from "../../fp";
import { hitCircleUnits, secondsToTicks, type BattleBulletSpawnParams, type BattleLaserSpawnParams } from "../../characters/base";

export type ExampleFairyMovementVariant = "left" | "right";

export interface ExampleFairyState extends NeutralMobState {
  readonly kind: "example_fairy";
  movementVariant: ExampleFairyMovementVariant;
  /** ageTicks at which the next volley fires, or -1 if none is scheduled. */
  volleyFireAge: number;
}

const MAX_HEALTH = 50;
const HIT_RADIUS = 36;
const ENTER_TICKS = secondsToTicks(3);
const ARC_TICKS = secondsToTicks(2);
const EXIT_TICKS = secondsToTicks(3);
const TOTAL_TICKS = ENTER_TICKS + ARC_TICKS + EXIT_TICKS;

const START = { x: ARENA_WIDTH / 2, y: 0 };
const ENTER_END = { x: ARENA_WIDTH / 2, y: ARENA_HEIGHT * 0.75 };
const LEFT_ARC_END = { x: ARENA_WIDTH * 0.1, y: ARENA_HEIGHT * 0.92 };
const RIGHT_ARC_END = { x: ARENA_WIDTH * 0.9, y: ARENA_HEIGHT * 0.92 };
const LEFT_EXIT = { x: -hitCircleUnits(12), y: ARENA_HEIGHT * 0.48 };
const RIGHT_EXIT = { x: ARENA_WIDTH + hitCircleUnits(12), y: ARENA_HEIGHT * 0.48 };

export class ExampleFairy extends NeutralMob<ExampleFairyState, BattleBulletSpawnParams, BattleLaserSpawnParams> {
  readonly state: ExampleFairyState;

  constructor(params: {
    readonly id: number;
    readonly waveId: number;
    readonly movementVariant: ExampleFairyMovementVariant;
    readonly pointRewardSize?: PointRewardSize;
  }) {
    super();
    this.state = {
      id: params.id,
      key: "Neutral",
      kind: "example_fairy",
      textureKey: "enemy_type_1",
      x: START.x,
      y: START.y,
      previousX: START.x,
      previousY: START.y,
      hitRadius: HIT_RADIUS,
      waveId: params.waveId,
      movementVariant: params.movementVariant,
      form: "enter",
      MaxHealth: MAX_HEALTH,
      CurrentHealth: MAX_HEALTH,
      pointRewardSize: params.pointRewardSize,
      active: true,
      ageTicks: 0,
      volleyFireAge: -1,
      sfxFlags: 0,
    };
  }

  static fromSnapshot(snapshot: NeutralMobState): ExampleFairy {
    const mob = new ExampleFairy({
      id: snapshot.id,
      waveId: snapshot.waveId,
      movementVariant: snapshot.movementVariant === "right" ? "right" : "left",
    });
    mob.restore(snapshot as ExampleFairyState);
    return mob;
  }

  /** Schedule a volley to fire at the given ageTicks. */
  queueVolleyAt(fireAge: number): void {
    this.state.volleyFireAge = fireAge;
  }

  onDeathEffect(): void {
    // No-op for ExampleFairy.
  }

  onDeath(_source: NeutralMobDeathSource): void {
    // Rewards will hook in here; ExampleFairy currently has no death reward.
  }

  move(): void {
    if (this.state.ageTicks <= ENTER_TICKS) {
      const t = ratio(this.state.ageTicks, ENTER_TICKS);
      this.state.x = START.x;
      this.state.y = lerp(START.y, ENTER_END.y, t);
      this.state.form = "enter";
      return;
    }

    if (this.state.ageTicks <= ENTER_TICKS + ARC_TICKS) {
      const t = ratio(this.state.ageTicks - ENTER_TICKS, ARC_TICKS);
      const arcEnd = this.state.movementVariant === "left" ? LEFT_ARC_END : RIGHT_ARC_END;
      const control = {
        x: this.state.movementVariant === "left" ? ARENA_WIDTH * 0.33 : ARENA_WIDTH * 0.67,
        y: ARENA_HEIGHT,
      };
      const point = quadraticBezier(ENTER_END, control, arcEnd, t);
      this.state.x = point.x;
      this.state.y = point.y;
      this.state.form = "arc";
      return;
    }

    const t = ratio(this.state.ageTicks - ENTER_TICKS - ARC_TICKS, EXIT_TICKS);
    const arcEnd = this.state.movementVariant === "left" ? LEFT_ARC_END : RIGHT_ARC_END;
    const exit = this.state.movementVariant === "left" ? LEFT_EXIT : RIGHT_EXIT;
    const control = {
      x: this.state.movementVariant === "left" ? ARENA_WIDTH * 0.02 : ARENA_WIDTH * 0.98,
      y: ARENA_HEIGHT * 0.75,
    };
    const point = quadraticBezier(arcEnd, control, exit, t);
    this.state.x = point.x;
    this.state.y = point.y;
    this.state.form = "exit";
  }

  fire(ctx: NeutralMobActionContext<BattleBulletSpawnParams, BattleLaserSpawnParams>): void {
    if (this.state.volleyFireAge < 0 || this.state.ageTicks < this.state.volleyFireAge) {
      return;
    }
    this.state.volleyFireAge = -1;
    this.spawnAimedBullet(ctx, ctx.player.x, ctx.player.y);
    this.spawnAimedBullet(ctx, ctx.target.x, ctx.target.y);
  }

  switchForm(): void {
    if (this.state.CurrentHealth <= this.state.MaxHealth / 2 && this.state.form !== "exit") {
      this.state.form = `${this.state.form}_damaged`;
    }
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

  private spawnAimedBullet(
    ctx: NeutralMobActionContext<BattleBulletSpawnParams, BattleLaserSpawnParams>,
    targetX: number,
    targetY: number,
  ): void {
    ctx.spawnBullet({
      owner: "Neutral",
      textureKey: "bullet_type_3_offset_6",
      kind: "orb",
      x: this.state.x,
      y: this.state.y,
      angle: fpAtan2(
        fp.fromFloat(targetY - this.state.y),
        fp.fromFloat(targetX - this.state.x),
      ),
      speedRank: "high",
      width: 10,
      height: 10,
      homingTicks: 0,
      spawnOffset: 0,
    });
  }
}

function ratio(ticks: number, duration: number): number {
  return fp.div(
    fp.fromInt(Math.max(0, Math.min(ticks, duration))),
    fp.fromInt(duration),
  );
}

function lerp(start: number, end: number, t: number): number {
  return fp.toFloat(fp.add(
    fp.fromFloat(start),
    fp.mul(fp.fromFloat(end - start), t),
  ));
}

function quadraticBezier(
  start: { readonly x: number; readonly y: number },
  control: { readonly x: number; readonly y: number },
  end: { readonly x: number; readonly y: number },
  t: number,
): { readonly x: number; readonly y: number } {
  const oneMinusT = fp.sub(fp.fromInt(1), t);
  const a = fp.mul(oneMinusT, oneMinusT);
  const b = fp.mul(fp.fromInt(2), fp.mul(oneMinusT, t));
  const c = fp.mul(t, t);
  return {
    x: fp.toFloat(fp.add(
      fp.add(fp.mul(fp.fromFloat(start.x), a), fp.mul(fp.fromFloat(control.x), b)),
      fp.mul(fp.fromFloat(end.x), c),
    )),
    y: fp.toFloat(fp.add(
      fp.add(fp.mul(fp.fromFloat(start.y), a), fp.mul(fp.fromFloat(control.y), b)),
      fp.mul(fp.fromFloat(end.y), c),
    )),
  };
}
