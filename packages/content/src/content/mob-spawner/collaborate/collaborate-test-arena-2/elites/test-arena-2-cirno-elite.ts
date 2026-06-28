import { fp } from "@shaisrc/fixed-point";
import { DEFAULT_ARENA_BOUNDS, type ArenaBounds } from "@repo/constants";
import {
  NeutralMob,
  type NeutralMobActionContext,
  type NeutralMobState,
} from "@repo/types";

import { FP_2, FP_PI, fpAtan2 } from "../../../../fp";
import {
  secondsToTicks,
  type BattleBulletSpawnParams,
  type BattleLaserSpawnParams,
} from "../../../../characters/base";
import {
  applySpellCardDamage,
  createSpellCardState,
  tickSpellCardState,
  type SpellCardPlan,
} from "../../spell-card";

export interface TestArena2CirnoEliteState extends NeutralMobState {
  readonly kind: "collaborate_test_arena_2_cirno_elite";
  nextFireAge: number;
  fireSubphase: number;
  pathIndex: number;
  rngState: number;
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

const HIT_RADIUS = 35;
const ENTER_TICKS = secondsToTicks(1.4);
const PLAN: SpellCardPlan = {
  nonSpellMaxHealth: 2000,
  nonSpellThresholdHealth: 1,
  spellCards: [
    {
      id: "ice-flight",
      displayName: "冰飞翔",
      maxHealth: 2500,
      durationTicks: secondsToTicks(20),
    },
  ],
};
const RING_16 = fp.div(fp.mul(FP_2, FP_PI), fp.fromInt(16));

export class TestArena2CirnoElite extends NeutralMob<
  TestArena2CirnoEliteState,
  BattleBulletSpawnParams,
  BattleLaserSpawnParams
> {
  readonly state: TestArena2CirnoEliteState;

  constructor(params: {
    readonly id: number;
    readonly waveId: number;
    readonly arenaBounds?: ArenaBounds;
    readonly rngSeed?: number;
    readonly moneyRewardDrops?: readonly RewardDrop[];
    readonly powerRewardDrops?: readonly RewardDrop[];
  }) {
    super();
    const bounds = params.arenaBounds ?? DEFAULT_ARENA_BOUNDS;
    this.state = {
      id: params.id,
      key: "Neutral",
      kind: "collaborate_test_arena_2_cirno_elite",
      class: "elite",
      displayName: "琪露诺",
      textureKey: "enemy_type_7",
      characterId: "cirno",
      x: -HIT_RADIUS,
      y: bounds.height * 0.5,
      previousX: -HIT_RADIUS,
      previousY: bounds.height * 0.5,
      hitRadius: HIT_RADIUS,
      hitWidth: 35,
      hitHeight: 35,
      waveId: params.waveId,
      movementVariant: "cirno_elite",
      form: "default",
      MaxHealth: PLAN.nonSpellMaxHealth,
      CurrentHealth: PLAN.nonSpellMaxHealth,
      moneyRewardDrops: params.moneyRewardDrops,
      powerRewardDrops: params.powerRewardDrops,
      spellCard: createSpellCardState(PLAN),
      active: true,
      ageTicks: 0,
      nextFireAge: ENTER_TICKS,
      fireSubphase: 0,
      pathIndex: 0,
      rngState: params.rngSeed ?? 0x1ce0001,
      sfxFlags: 0,
    };
  }

  static fromSnapshot(snapshot: NeutralMobState): TestArena2CirnoElite {
    const s = snapshot as TestArena2CirnoEliteState;
    const mob = new TestArena2CirnoElite({
      id: s.id,
      waveId: s.waveId,
      rngSeed: s.rngState,
    });
    mob.restore(s);
    return mob;
  }

  onDeathEffect(): void {}
  onDeath(): void {}

  move(ctx: BoundedMobActionContext): void {
    const b = ctx.arenaBounds;
    const center = { x: b.width * 0.5, y: b.height * 0.5 };
    if (this.state.ageTicks <= ENTER_TICKS) {
      const t = ratio(this.state.ageTicks, ENTER_TICKS);
      this.state.x = lerp(-HIT_RADIUS, center.x, t);
      this.state.y = center.y;
      return;
    }

    if (this.state.spellCard?.phase === "spell_card") {
      this.moveIceFlight(b);
      this.syncHealthFromSpellCard();
      return;
    }

    const points = [
      center,
      { x: b.width * 0.5, y: b.height * 0.2 },
      { x: b.width * 0.3, y: b.height * 0.7 },
      { x: b.width * 0.7, y: b.height * 0.7 },
      center,
    ];
    const local = this.state.ageTicks - ENTER_TICKS;
    const moveTicks = secondsToTicks(0.8);
    const waitTicks = secondsToTicks(1);
    const cycle = moveTicks + waitTicks;
    const index = Math.min(3, Math.floor(local / cycle));
    const phase = local % cycle;
    this.state.pathIndex = index;
    if (phase <= moveTicks) {
      const p = lerpPoint(
        points[index]!,
        points[index + 1]!,
        ratio(phase, moveTicks),
      );
      this.state.x = p.x;
      this.state.y = p.y;
    }
    this.syncHealthFromSpellCard();
  }

  fire(
    ctx: NeutralMobActionContext<
      BattleBulletSpawnParams,
      BattleLaserSpawnParams
    >,
  ): void {
    if (!this.state.spellCard || this.state.ageTicks < this.state.nextFireAge)
      return;
    if (this.state.spellCard.phase === "spell_card") {
      this.fireIceFlight(ctx);
      this.state.nextFireAge = this.state.ageTicks + secondsToTicks(0.18);
    } else if (this.state.fireSubphase < 8) {
      this.firePathStopPattern(ctx);
      this.state.nextFireAge = this.state.ageTicks + secondsToTicks(1);
    } else {
      this.fireDirectionalCycle(ctx);
      this.state.nextFireAge = this.state.ageTicks + secondsToTicks(1);
    }
    this.state.fireSubphase += 1;
  }

  switchForm(): void {
    if (!this.state.spellCard) return;
    const result = tickSpellCardState(this.state.spellCard);
    this.state.spellCard = result.state;
    this.syncHealthFromSpellCard();
    if (result.defeated) this.state.active = false;
    this.state.form = formForAge(this.state.ageTicks);
  }

  die(): void {
    if (this.state.CurrentHealth <= 0 && !this.state.spellCard)
      this.state.active = false;
  }

  onProjectileHit(damage: number): "accepted" | "ignored" {
    if (!this.state.active || damage <= 0 || !this.state.spellCard)
      return "ignored";
    const result = applySpellCardDamage(this.state.spellCard, damage);
    this.state.spellCard = result.state;
    this.syncHealthFromSpellCard();
    if (result.defeated) this.state.active = false;
    return "accepted";
  }

  private firePathStopPattern(
    ctx: NeutralMobActionContext<
      BattleBulletSpawnParams,
      BattleLaserSpawnParams
    >,
  ): void {
    const diagonalBase = Math.PI / 4;
    for (let d = 0; d < 4; d += 1) {
      const base = diagonalBase + d * (Math.PI / 2);
      for (let i = -2; i <= 2; i += 1)
        this.spawnBullet(ctx, base + i * 0.08, "high", 12);
      this.spawnBullet(ctx, base + 0.35, "low", 10);
    }
  }

  private fireDirectionalCycle(
    ctx: NeutralMobActionContext<
      BattleBulletSpawnParams,
      BattleLaserSpawnParams
    >,
  ): void {
    const base = (Math.floor(this.state.fireSubphase / 2) % 4) * (Math.PI / 2);
    for (let i = -5; i <= 5; i += 1)
      this.spawnBullet(ctx, base + i * 0.06, "medium", 12);
  }

  private fireIceFlight(
    ctx: NeutralMobActionContext<
      BattleBulletSpawnParams,
      BattleLaserSpawnParams
    >,
  ): void {
    for (const side of [-1, 1]) {
      const angle =
        this.motionAngle() +
        side * (Math.PI / 2) +
        (this.nextUnit() - 0.5) * 0.8;
      this.spawnBullet(
        ctx,
        angle,
        this.nextUnit() < 0.5 ? "low" : "medium",
        10,
      );
    }
    if (this.state.fireSubphase % 6 === 0) {
      for (let i = 0; i < 16; i += 1) {
        this.spawnBullet(
          ctx,
          fp.toFloat(fp.mul(fp.fromInt(i), RING_16)),
          "low",
          9,
        );
      }
    }
  }

  private moveIceFlight(b: ArenaBounds): void {
    const local = this.state.spellCard
      ? PLAN.spellCards[0]!.durationTicks - this.state.spellCard.remainingTicks
      : 0;
    const a = { x: b.width * 0.1, y: b.height * 0.1 };
    const c = { x: b.width * 0.9, y: b.height * 0.9 };
    const period = secondsToTicks(8);
    const phase = local % period;
    const wait = secondsToTicks(1);
    const dash = secondsToTicks(1.2);
    if (phase < wait) {
      this.state.x = a.x;
      this.state.y = a.y;
      return;
    }
    if (phase < wait + dash) {
      const p = lerpPoint(a, c, ratio(phase - wait, dash));
      this.state.x = p.x;
      this.state.y = p.y;
      return;
    }
    if (phase < wait + dash + secondsToTicks(3)) {
      this.state.x = c.x;
      this.state.y = c.y;
      return;
    }
    const p = lerpPoint(
      c,
      a,
      ratio(phase - wait - dash - secondsToTicks(3), dash),
    );
    this.state.x = p.x;
    this.state.y = p.y;
  }

  private motionAngle(): number {
    return this.state.previousX === this.state.x &&
      this.state.previousY === this.state.y
      ? Math.PI / 4
      : fpAtan2(
          fp.fromFloat(this.state.y - this.state.previousY),
          fp.fromFloat(this.state.x - this.state.previousX),
        );
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
      owner: ctx.owner,
      textureKey: "bullet_type_3_offset_6",
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

  private nextUnit(): number {
    this.state.rngState =
      (Math.imul(this.state.rngState, 1664525) + 1013904223) >>> 0;
    return (this.state.rngState & 0xffff) / 0x10000;
  }

  private syncHealthFromSpellCard(): void {
    if (!this.state.spellCard) return;
    this.state.MaxHealth = this.state.spellCard.maxHealth;
    this.state.CurrentHealth = this.state.spellCard.currentHealth;
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

function lerpPoint(
  start: { readonly x: number; readonly y: number },
  end: { readonly x: number; readonly y: number },
  t: number,
) {
  return { x: lerp(start.x, end.x, t), y: lerp(start.y, end.y, t) };
}

function formForAge(ageTicks: number): string {
  const phase = Math.floor(ageTicks / 16) % 3;
  return phase === 0 ? "default" : phase === 1 ? "turn" : "move";
}
