import { fp } from "@shaisrc/fixed-point";
import { DEFAULT_ARENA_BOUNDS, type ArenaBounds } from "@repo/constants";
import type {
  MoneyRewardSize,
  PointRewardSize,
  PowerRewardSize,
} from "@repo/constants";
import {
  NeutralMob,
  type NeutralMobActionContext,
  type NeutralMobDeathSource,
  type NeutralMobState,
} from "@repo/types";

import { FP_2, FP_PI, fpAtan2 } from "../../../../fp";
import {
  secondsToTicks,
  type BattleBulletSpawnParams,
  type BattleLaserSpawnParams,
} from "../../../../characters/base";

export type TestArena2FairySpecies = "fairy1" | "fairy2" | "fairy3";
export type TestArena2FairyMovementVariant =
  | "w1_down"
  | "w1_up"
  | "w2_top"
  | "w2_bottom"
  | "w3_left"
  | "w3_right"
  | "w4_top"
  | "w4_left"
  | "w4_right"
  | "w4_bottom"
  | "w5_drop_left"
  | "w5_drop_center"
  | "w5_drop_right"
  | "w5_diag_left"
  | "w5_diag_right"
  | "w6_left"
  | "w6_right"
  | "w7_left"
  | "w7_right";

export interface TestArena2FairyState extends NeutralMobState {
  readonly kind: "collaborate_test_arena_2_fairy";
  species: TestArena2FairySpecies;
  movementVariant: TestArena2FairyMovementVariant;
  nextFireAge: number;
  fireSubphase: number;
  spawnIndex: number;
  pointRewardDrops?: readonly RewardDrop[];
  moneyRewardDrops?: readonly RewardDrop[];
  powerRewardDrops?: readonly RewardDrop[];
}

interface RewardDrop {
  readonly size: "small" | "medium" | "large";
  readonly count?: number;
}

type BoundedMobActionContext = NeutralMobActionContext<
  BattleBulletSpawnParams,
  BattleLaserSpawnParams
> & {
  readonly arenaBounds: ArenaBounds;
};

const CIRCLE_16_STEP = fp.div(fp.mul(FP_2, FP_PI), fp.fromInt(16));
const CIRCLE_24_STEP = fp.div(fp.mul(FP_2, FP_PI), fp.fromInt(24));
const CIRCLE_32_STEP = fp.div(fp.mul(FP_2, FP_PI), fp.fromInt(32));
const FAN_10_DEG = Math.PI / 18;

export class TestArena2Fairy extends NeutralMob<
  TestArena2FairyState,
  BattleBulletSpawnParams,
  BattleLaserSpawnParams
> {
  readonly state: TestArena2FairyState;

  constructor(params: {
    readonly id: number;
    readonly waveId: number;
    readonly species: TestArena2FairySpecies;
    readonly movementVariant: TestArena2FairyMovementVariant;
    readonly spawnIndex?: number;
    readonly pointRewardSize?: PointRewardSize;
    readonly moneyRewardSize?: MoneyRewardSize;
    readonly powerRewardSize?: PowerRewardSize;
    readonly pointRewardDrops?: readonly RewardDrop[];
    readonly moneyRewardDrops?: readonly RewardDrop[];
    readonly powerRewardDrops?: readonly RewardDrop[];
    readonly arenaBounds?: ArenaBounds;
  }) {
    super();
    const bounds = params.arenaBounds ?? DEFAULT_ARENA_BOUNDS;
    const start = startPoint(params.movementVariant, bounds);
    const stats = speciesStats(params.species);
    this.state = {
      id: params.id,
      key: "Neutral",
      kind: "collaborate_test_arena_2_fairy",
      class: "minion",
      displayName: stats.displayName,
      textureKey: stats.textureKey,
      x: start.x,
      y: start.y,
      previousX: start.x,
      previousY: start.y,
      hitRadius: stats.hitRadius,
      hitWidth: stats.hitSize,
      hitHeight: stats.hitSize,
      waveId: params.waveId,
      movementVariant: params.movementVariant,
      species: params.species,
      form: "default",
      MaxHealth: stats.health,
      CurrentHealth: stats.health,
      pointRewardSize: params.pointRewardSize,
      moneyRewardSize: params.moneyRewardSize,
      powerRewardSize: params.powerRewardSize,
      pointRewardDrops: params.pointRewardDrops,
      moneyRewardDrops: params.moneyRewardDrops,
      powerRewardDrops: params.powerRewardDrops,
      active: true,
      ageTicks: 0,
      nextFireAge: firstFireAge(params.movementVariant),
      fireSubphase: 0,
      spawnIndex: params.spawnIndex ?? 0,
      sfxFlags: 0,
    };
  }

  static fromSnapshot(snapshot: NeutralMobState): TestArena2Fairy {
    const s = snapshot as TestArena2FairyState;
    const mob = new TestArena2Fairy({
      id: s.id,
      waveId: s.waveId,
      species: normalizeSpecies(s.species),
      movementVariant: normalizeVariant(s.movementVariant),
      spawnIndex: s.spawnIndex,
    });
    mob.restore(s);
    return mob;
  }

  onDeathEffect(): void {
    // Reward drops are emitted by PointManager from state.
  }

  onDeath(_source: NeutralMobDeathSource): void {
    // No extra side effects.
  }

  move(ctx: BoundedMobActionContext): void {
    const path = pathFor(this.state.movementVariant, ctx.arenaBounds);
    const p = samplePolyline(path.points, this.state.ageTicks, path.segmentTicks);
    this.state.x = p.x;
    this.state.y =
      this.state.movementVariant === "w6_left" ||
      this.state.movementVariant === "w6_right"
        ? ctx.arenaBounds.height * (this.state.spawnIndex / 100)
        : p.y;
    this.state.form = formForAge(this.state.ageTicks);
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

    switch (this.state.movementVariant) {
      case "w2_top":
      case "w2_bottom":
        this.fireDoubleAimedFans(ctx, 4, "medium", 0.08);
        this.state.nextFireAge = Number.MAX_SAFE_INTEGER;
        break;
      case "w3_left":
      case "w3_right":
        this.fireWideAimed(ctx, "high");
        this.state.nextFireAge = this.state.fireSubphase === 0
          ? this.state.ageTicks + secondsToTicks(2)
          : Number.MAX_SAFE_INTEGER;
        break;
      case "w4_top":
      case "w4_left":
      case "w4_right":
      case "w4_bottom":
        this.fireRing(ctx, 32, CIRCLE_32_STEP, "medium", 0.08);
        this.state.nextFireAge =
          this.state.fireSubphase >= 6
            ? Number.MAX_SAFE_INTEGER
            : this.state.ageTicks + secondsToTicks(0.9);
        break;
      case "w5_drop_left":
      case "w5_drop_center":
      case "w5_drop_right":
        this.fireDoubleAimedFans(ctx, 2, "medium", 0.1);
        this.fireRing(ctx, 16, CIRCLE_16_STEP, "low", 0.03);
        this.state.nextFireAge = Number.MAX_SAFE_INTEGER;
        break;
      case "w5_diag_left":
      case "w5_diag_right":
        this.fireWideAimed(ctx, "low");
        this.state.nextFireAge = this.state.ageTicks + secondsToTicks(1.2);
        break;
      case "w7_left":
      case "w7_right":
        this.fireRing(ctx, 24, CIRCLE_24_STEP, "low", this.state.fireSubphase % 2 === 0 ? 0 : Math.PI / 24);
        this.state.nextFireAge = this.state.ageTicks + secondsToTicks(1.1);
        break;
      default:
        this.state.nextFireAge = Number.MAX_SAFE_INTEGER;
        break;
    }
    this.state.fireSubphase += 1;
  }

  switchForm(): void {
    if (this.state.CurrentHealth <= this.state.MaxHealth / 2) {
      this.state.form = this.state.form === "move" ? "turn" : this.state.form;
    }
  }

  die(ctx: NeutralMobActionContext<BattleBulletSpawnParams, BattleLaserSpawnParams>): void {
    if (this.state.CurrentHealth <= 0) {
      this.fireDeathPattern(ctx);
      this.state.active = false;
      return;
    }
    if (this.state.ageTicks >= lifetimeFor(this.state.movementVariant)) {
      this.state.active = false;
    }
  }

  onProjectileHit(damage: number): "accepted" | "ignored" {
    if (!this.state.active || damage <= 0) {
      return "ignored";
    }
    this.state.CurrentHealth = Math.max(0, this.state.CurrentHealth - damage);
    return "accepted";
  }

  private fireDeathPattern(
    ctx: NeutralMobActionContext<
      BattleBulletSpawnParams,
      BattleLaserSpawnParams
    >,
  ): void {
    if (this.state.movementVariant === "w5_diag_left" || this.state.movementVariant === "w5_diag_right") {
      this.fireRing(ctx, 16, CIRCLE_16_STEP, "low", 0);
    }
    if (this.state.movementVariant === "w6_left" || this.state.movementVariant === "w6_right") {
      this.fireDoubleAimedFans(ctx, 3, "high", FAN_10_DEG);
    }
  }

  private fireDoubleAimedFans(
    ctx: NeutralMobActionContext<
      BattleBulletSpawnParams,
      BattleLaserSpawnParams
    >,
    count: number,
    speedRank: BattleBulletSpawnParams["speedRank"],
    spread: number,
  ): void {
    for (const target of [ctx.player, ctx.target]) {
      const base = fpAtan2(
        fp.fromFloat(target.y - this.state.y),
        fp.fromFloat(target.x - this.state.x),
      );
      const start = -(count - 1) / 2;
      for (let i = 0; i < count; i += 1) {
        this.spawnBullet(ctx, base + (start + i) * spread, speedRank, 12);
      }
    }
  }

  private fireWideAimed(
    ctx: NeutralMobActionContext<
      BattleBulletSpawnParams,
      BattleLaserSpawnParams
    >,
    speedRank: BattleBulletSpawnParams["speedRank"],
  ): void {
    for (const target of [ctx.player, ctx.target]) {
      const base = fpAtan2(
        fp.fromFloat(target.y - this.state.y),
        fp.fromFloat(target.x - this.state.x),
      );
      for (let i = -2; i <= 2; i += 1) {
        this.spawnBullet(ctx, base + i * FAN_10_DEG, speedRank, 13);
      }
    }
  }

  private fireRing(
    ctx: NeutralMobActionContext<
      BattleBulletSpawnParams,
      BattleLaserSpawnParams
    >,
    count: number,
    step: number,
    speedRank: BattleBulletSpawnParams["speedRank"],
    offset: number,
  ): void {
    const base = this.state.fireSubphase * offset;
    for (let i = 0; i < count; i += 1) {
      this.spawnBullet(
        ctx,
        base + fp.toFloat(fp.mul(fp.fromInt(i), step)),
        speedRank,
        this.state.species === "fairy3" ? 15 : 11,
      );
    }
  }

  private spawnBullet(
    ctx: NeutralMobActionContext<
      BattleBulletSpawnParams,
      BattleLaserSpawnParams
    >,
    angle: number,
    speedRank: BattleBulletSpawnParams["speedRank"],
    size: number,
  ): void {
    ctx.spawnBullet({
      owner: "Neutral",
      textureKey:
        this.state.species === "fairy2"
          ? "bullet_type_21_offset_1"
          : "bullet_type_3_offset_12",
      kind: "orb",
      x: this.state.x,
      y: this.state.y,
      angle,
      speedRank,
      width: size,
      height: size,
      homingTicks: 0,
      spawnOffset: 0,
    });
  }
}

interface Point {
  readonly x: number;
  readonly y: number;
}

function speciesStats(species: TestArena2FairySpecies): {
  readonly displayName: string;
  readonly textureKey: string;
  readonly health: number;
  readonly hitSize: number;
  readonly hitRadius: number;
} {
  switch (species) {
    case "fairy2":
      return {
        displayName: "妖精2",
        textureKey: "enemy_type_2",
        health: 180,
        hitSize: 26,
        hitRadius: 26,
      };
    case "fairy3":
      return {
        displayName: "妖精3",
        textureKey: "enemy_type_7",
        health: 800,
        hitSize: 45,
        hitRadius: 45,
      };
    default:
      return {
        displayName: "妖精1",
        textureKey: "enemy_type_1",
        health: 5,
        hitSize: 26,
        hitRadius: 26,
      };
  }
}

function startPoint(variant: TestArena2FairyMovementVariant, bounds: ArenaBounds): Point {
  return pathFor(variant, bounds).points[0] ?? { x: 0, y: 0 };
}

function pathFor(
  variant: TestArena2FairyMovementVariant,
  b: ArenaBounds,
): { readonly points: readonly Point[]; readonly segmentTicks: readonly number[] } {
  const out = 80;
  switch (variant) {
    case "w1_down":
      return line({ x: b.width * 0.25, y: -out }, { x: b.width * 0.25, y: b.height + out }, secondsToTicks(7));
    case "w1_up":
      return line({ x: b.width * 0.75, y: b.height + out }, { x: b.width * 0.75, y: -out }, secondsToTicks(7));
    case "w2_top":
      return multi([{ x: b.width * 0.4, y: -out }, { x: b.width * 0.4, y: b.height * 0.9 }, { x: b.width * 0.15, y: b.height * 0.9 }, { x: b.width * 0.15, y: -out }], [secondsToTicks(2.2), secondsToTicks(1.2), secondsToTicks(3.2)]);
    case "w2_bottom":
      return multi([{ x: b.width * 0.6, y: b.height + out }, { x: b.width * 0.6, y: b.height * 0.1 }, { x: b.width * 0.85, y: b.height * 0.1 }, { x: b.width * 0.85, y: b.height + out }], [secondsToTicks(2.2), secondsToTicks(1.2), secondsToTicks(3.2)]);
    case "w3_left":
      return multi([{ x: -out, y: b.height * 0.3 }, { x: b.width * 0.5, y: b.height * 0.3 }, { x: b.width * 0.5, y: b.height * 0.3 }, { x: b.width + out, y: b.height * 0.3 }], [secondsToTicks(1.8), secondsToTicks(3), secondsToTicks(2.8)]);
    case "w3_right":
      return multi([{ x: b.width + out, y: b.height * 0.7 }, { x: b.width * 0.5, y: b.height * 0.7 }, { x: b.width * 0.5, y: b.height * 0.7 }, { x: -out, y: b.height * 0.7 }], [secondsToTicks(1.8), secondsToTicks(3), secondsToTicks(2.8)]);
    case "w4_top":
      return centerAndBack({ x: b.width * 0.5, y: -out }, b);
    case "w4_left":
      return centerAndBack({ x: -out, y: b.height * 0.5 }, b);
    case "w4_right":
      return centerAndBack({ x: b.width + out, y: b.height * 0.5 }, b);
    case "w4_bottom":
      return centerAndBack({ x: b.width * 0.5, y: b.height + out }, b);
    case "w5_drop_left":
      return line({ x: b.width * 0.2, y: -out }, { x: b.width * 0.2, y: b.height + out }, secondsToTicks(6));
    case "w5_drop_center":
      return line({ x: b.width * 0.5, y: -out }, { x: b.width * 0.5, y: b.height + out }, secondsToTicks(6));
    case "w5_drop_right":
      return line({ x: b.width * 0.8, y: -out }, { x: b.width * 0.8, y: b.height + out }, secondsToTicks(6));
    case "w5_diag_left":
      return line({ x: -out, y: b.height + out }, { x: b.width + out, y: -out }, secondsToTicks(7));
    case "w5_diag_right":
      return line({ x: b.width + out, y: b.height + out }, { x: -out, y: -out }, secondsToTicks(7));
    case "w6_left":
      return line({ x: -out, y: b.height * 0.5 }, { x: b.width + out, y: b.height * 0.5 }, secondsToTicks(4.5));
    case "w6_right":
      return line({ x: b.width + out, y: b.height * 0.5 }, { x: -out, y: b.height * 0.5 }, secondsToTicks(4.5));
    case "w7_left":
      return multi([{ x: b.width * 0.35, y: -out }, { x: b.width * 0.35, y: b.height * 0.5 }, { x: b.width * 0.35, y: b.height * 0.5 }], [secondsToTicks(2.5), secondsToTicks(18)]);
    case "w7_right":
      return multi([{ x: b.width * 0.65, y: -out }, { x: b.width * 0.65, y: b.height * 0.5 }, { x: b.width * 0.65, y: b.height * 0.5 }], [secondsToTicks(2.5), secondsToTicks(18)]);
  }
}

function line(start: Point, end: Point, ticks: number) {
  return multi([start, end], [ticks]);
}

function multi(points: readonly Point[], segmentTicks: readonly number[]) {
  return { points, segmentTicks };
}

function centerAndBack(start: Point, b: ArenaBounds) {
  const nearCenter = {
    x: start.x + (b.width * 0.5 - start.x) * 0.95,
    y: start.y + (b.height * 0.5 - start.y) * 0.95,
  };
  return multi([start, nearCenter, nearCenter, start], [secondsToTicks(1.7), secondsToTicks(6), secondsToTicks(3.2)]);
}

function samplePolyline(
  points: readonly Point[],
  ageTicks: number,
  segmentTicks: readonly number[],
): Point {
  let remaining = ageTicks;
  for (let i = 0; i < segmentTicks.length; i += 1) {
    const duration = segmentTicks[i] ?? 1;
    if (remaining <= duration) {
      return lerpPoint(points[i] ?? points[0], points[i + 1] ?? points[i] ?? points[0], ratio(remaining, duration));
    }
    remaining -= duration;
  }
  return points[points.length - 1] ?? { x: 0, y: 0 };
}

function ratio(ticks: number, duration: number): number {
  return fp.div(fp.fromInt(Math.max(0, Math.min(ticks, duration))), fp.fromInt(duration));
}

function lerpPoint(start: Point, end: Point, t: number): Point {
  return {
    x: fp.toFloat(fp.add(fp.fromFloat(start.x), fp.mul(fp.fromFloat(end.x - start.x), t))),
    y: fp.toFloat(fp.add(fp.fromFloat(start.y), fp.mul(fp.fromFloat(end.y - start.y), t))),
  };
}

function lifetimeFor(variant: TestArena2FairyMovementVariant): number {
  const path = pathFor(variant, DEFAULT_ARENA_BOUNDS);
  return path.segmentTicks.reduce((sum, ticks) => sum + ticks, 0) + secondsToTicks(0.5);
}

function firstFireAge(variant: TestArena2FairyMovementVariant): number {
  if (variant === "w3_left" || variant === "w3_right") return secondsToTicks(2.8);
  if (variant.startsWith("w4_")) return secondsToTicks(1.8);
  if (variant.startsWith("w5_drop")) return secondsToTicks(2.7);
  if (variant.startsWith("w5_diag")) return secondsToTicks(1);
  if (variant.startsWith("w7_")) return secondsToTicks(2.7);
  if (variant.startsWith("w2_")) return secondsToTicks(2.3);
  return Number.MAX_SAFE_INTEGER;
}

function formForAge(ageTicks: number): string {
  const phase = Math.floor(ageTicks / 16) % 3;
  return phase === 0 ? "default" : phase === 1 ? "turn" : "move";
}

function normalizeSpecies(value: string): TestArena2FairySpecies {
  return value === "fairy2" || value === "fairy3" ? value : "fairy1";
}

function normalizeVariant(value: string): TestArena2FairyMovementVariant {
  const variants: readonly TestArena2FairyMovementVariant[] = [
    "w1_down", "w1_up", "w2_top", "w2_bottom", "w3_left", "w3_right",
    "w4_top", "w4_left", "w4_right", "w4_bottom", "w5_drop_left",
    "w5_drop_center", "w5_drop_right", "w5_diag_left", "w5_diag_right",
    "w6_left", "w6_right", "w7_left", "w7_right",
  ];
  return variants.includes(value as TestArena2FairyMovementVariant)
    ? (value as TestArena2FairyMovementVariant)
    : "w1_down";
}
