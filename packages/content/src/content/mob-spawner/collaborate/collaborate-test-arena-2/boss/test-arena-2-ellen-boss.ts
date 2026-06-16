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

export interface TestArena2EllenBossState extends NeutralMobState {
  readonly kind: "collaborate_test_arena_2_ellen_boss";
  nextFireAge: number;
  fireSubphase: number;
  rngState: number;
}

type BoundedMobActionContext = NeutralMobActionContext<
  BattleBulletSpawnParams,
  BattleLaserSpawnParams
> & {
  readonly arenaBounds: ArenaBounds;
};

const HIT_RADIUS = 48;
const ENTER_TICKS = secondsToTicks(1.8);
const PLAN: SpellCardPlan = {
  nonSpellMaxHealth: 2000,
  nonSpellThresholdHealth: 1,
  spellCards: [
    {
      id: "eternal-love",
      displayName: "久远之爱",
      maxHealth: 2500,
      durationTicks: secondsToTicks(20),
    },
    {
      id: "work-hard-today",
      displayName: "今天也要努力工作",
      maxHealth: 3000,
      durationTicks: secondsToTicks(30),
    },
  ],
};
const RING_16 = fp.div(fp.mul(FP_2, FP_PI), fp.fromInt(16));
const RING_24 = fp.div(fp.mul(FP_2, FP_PI), fp.fromInt(24));

export class TestArena2EllenBoss extends NeutralMob<
  TestArena2EllenBossState,
  BattleBulletSpawnParams,
  BattleLaserSpawnParams
> {
  readonly state: TestArena2EllenBossState;

  constructor(params: {
    readonly id: number;
    readonly waveId: number;
    readonly arenaBounds?: ArenaBounds;
    readonly rngSeed?: number;
  }) {
    super();
    const b = params.arenaBounds ?? DEFAULT_ARENA_BOUNDS;
    this.state = {
      id: params.id,
      key: "Neutral",
      kind: "collaborate_test_arena_2_ellen_boss",
      class: "boss",
      displayName: "Ellen",
      textureKey: "enemy_type_7",
      characterId: "ellen",
      x: b.width * 0.5,
      y: -HIT_RADIUS,
      previousX: b.width * 0.5,
      previousY: -HIT_RADIUS,
      hitRadius: HIT_RADIUS,
      waveId: params.waveId,
      movementVariant: "ellen_boss",
      form: "default",
      MaxHealth: PLAN.nonSpellMaxHealth,
      CurrentHealth: PLAN.nonSpellMaxHealth,
      spellCard: createSpellCardState(PLAN),
      active: true,
      ageTicks: 0,
      nextFireAge: ENTER_TICKS,
      fireSubphase: 0,
      rngState: params.rngSeed ?? 0xe11e0001,
      sfxFlags: 0,
    };
  }

  static fromSnapshot(snapshot: NeutralMobState): TestArena2EllenBoss {
    const s = snapshot as TestArena2EllenBossState;
    const mob = new TestArena2EllenBoss({
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
    if (this.state.ageTicks <= ENTER_TICKS) {
      const t = ratio(this.state.ageTicks, ENTER_TICKS);
      this.state.x = b.width * 0.5;
      this.state.y = lerp(-HIT_RADIUS, b.height * 0.22, t);
      return;
    }
    if (this.state.spellCard?.phase === "spell_card" && currentSpellId(this.state) === "work-hard-today") {
      const points = [
        { x: b.width * 0.2, y: b.height * 0.2 },
        { x: b.width * 0.5, y: b.height * 0.8 },
        { x: b.width * 0.8, y: b.height * 0.2 },
      ];
      const local = PLAN.spellCards[1]!.durationTicks - this.state.spellCard.remainingTicks;
      const from = points[Math.floor(local / secondsToTicks(3)) % points.length]!;
      const to = points[(Math.floor(local / secondsToTicks(3)) + 1) % points.length]!;
      const p = lerpPoint(from, to, ratio(local % secondsToTicks(3), secondsToTicks(3)));
      this.state.x = p.x; this.state.y = p.y;
    } else {
      this.state.x = b.width * 0.5;
      this.state.y = b.height * 0.25;
    }
    this.syncHealthFromSpellCard();
  }

  fire(ctx: NeutralMobActionContext<BattleBulletSpawnParams, BattleLaserSpawnParams>): void {
    if (!this.state.spellCard || this.state.ageTicks < this.state.nextFireAge) return;
    if (this.state.spellCard.phase === "non_spell") {
      if (this.state.spellCard.spellCardIndex === 0) this.fireSplitRing(ctx);
      else this.fireRandomHeart(ctx);
      this.state.nextFireAge = this.state.ageTicks + secondsToTicks(2);
    } else if (currentSpellId(this.state) === "eternal-love") {
      this.fireHeartSnipe(ctx);
      this.fireSmallRing(ctx);
      this.state.nextFireAge = this.state.ageTicks + secondsToTicks(2);
    } else {
      this.fireOrbitingWork(ctx);
      this.state.nextFireAge = this.state.ageTicks + secondsToTicks(0.55);
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
    if (this.state.CurrentHealth <= 0 && !this.state.spellCard) this.state.active = false;
  }

  onProjectileHit(damage: number): "accepted" | "ignored" {
    if (!this.state.active || damage <= 0 || !this.state.spellCard) return "ignored";
    const result = applySpellCardDamage(this.state.spellCard, damage);
    this.state.spellCard = result.state;
    this.syncHealthFromSpellCard();
    if (result.defeated) this.state.active = false;
    return "accepted";
  }

  private fireSplitRing(ctx: NeutralMobActionContext<BattleBulletSpawnParams, BattleLaserSpawnParams>): void {
    const base = this.state.fireSubphase * (Math.PI / 24);
    for (let i = 0; i < 24; i += 1) {
      const angle = base + fp.toFloat(fp.mul(fp.fromInt(i), RING_24));
      const target = i % 2 === 0 ? ctx.player : ctx.target;
      ctx.spawnBullet({
        owner: "Neutral",
        textureKey: "bullet_type_3_offset_12",
        kind: "orb",
        x: this.state.x,
        y: this.state.y,
        angle,
        speedRank: "low",
        width: 13,
        height: 13,
        homingTicks: 0,
        spawnOffset: 0,
        retargetAt: 60,
        retargetAimOwner: i % 2 === 0 ? "Player1" : "Player2",
        retargetX: target.x,
        retargetY: target.y,
        retargetSpeed: 5,
      });
    }
  }

  private fireHeartSnipe(ctx: NeutralMobActionContext<BattleBulletSpawnParams, BattleLaserSpawnParams>): void {
    const target = this.state.fireSubphase % 2 === 0 ? ctx.player : ctx.target;
    const base = fpAtan2(fp.fromFloat(target.y - this.state.y), fp.fromFloat(target.x - this.state.x));
    for (const p of heartPoints()) {
      this.spawnBullet(ctx, base + p.x * 0.035, "high", 11, p.x * 10, -p.y * 10);
    }
  }

  private fireSmallRing(ctx: NeutralMobActionContext<BattleBulletSpawnParams, BattleLaserSpawnParams>): void {
    for (let i = 0; i < 16; i += 1) {
      this.spawnBullet(ctx, this.state.fireSubphase * 0.1 + fp.toFloat(fp.mul(fp.fromInt(i), RING_16)), "low", 9);
    }
  }

  private fireRandomHeart(ctx: NeutralMobActionContext<BattleBulletSpawnParams, BattleLaserSpawnParams>): void {
    for (const p of heartPoints()) {
      const angle = Math.atan2(-p.y, p.x) + (this.nextUnit() - 0.5) * 0.5;
      this.spawnBullet(ctx, angle, this.nextUnit() < 0.45 ? "low" : "medium", 11, p.x * 8, -p.y * 8);
    }
  }

  private fireOrbitingWork(ctx: NeutralMobActionContext<BattleBulletSpawnParams, BattleLaserSpawnParams>): void {
    const base = this.state.fireSubphase * 0.22;
    for (let i = 0; i < 10; i += 1) {
      const angle = base + (i * Math.PI * 2) / 10;
      ctx.spawnBullet({
        owner: "Neutral",
        textureKey: "bullet_type_21_offset_1",
        kind: "orb",
        x: this.state.x,
        y: this.state.y,
        angle,
        speedRank: "low",
        width: 22,
        height: 22,
        homingTicks: 0,
        spawnOffset: 0,
        polarOriginX: this.state.x,
        polarOriginY: this.state.y,
        polarRadius: 72,
        polarAngle: angle,
        polarRadialSpeed: this.state.fireSubphase % 6 === 5 ? 2.4 : 0,
        polarAngularSpeed: 0.045,
      });
    }
    if (this.state.fireSubphase % 6 === 5) {
      for (let i = 0; i < 16; i += 1) {
        this.spawnBullet(ctx, fp.toFloat(fp.mul(fp.fromInt(i), RING_16)), "medium", 9);
      }
    }
  }

  private spawnBullet(ctx: NeutralMobActionContext<BattleBulletSpawnParams, BattleLaserSpawnParams>, angle: number, speedRank: BattleBulletSpawnParams["speedRank"], size: number, ox = 0, oy = 0): void {
    ctx.spawnBullet({
      owner: "Neutral",
      textureKey: "bullet_type_3_offset_12",
      kind: "orb",
      x: this.state.x + ox,
      y: this.state.y + oy,
      angle,
      speedRank,
      width: size,
      height: size,
      homingTicks: 0,
      spawnOffset: 0,
    });
  }

  private nextUnit(): number {
    this.state.rngState = (Math.imul(this.state.rngState, 1664525) + 1013904223) >>> 0;
    return (this.state.rngState & 0xffff) / 0x10000;
  }

  private syncHealthFromSpellCard(): void {
    if (!this.state.spellCard) return;
    this.state.MaxHealth = this.state.spellCard.maxHealth;
    this.state.CurrentHealth = this.state.spellCard.currentHealth;
  }
}

function currentSpellId(state: TestArena2EllenBossState): string | undefined {
  return state.spellCard?.spellCards[state.spellCard.spellCardIndex]?.id;
}

function heartPoints(): readonly { readonly x: number; readonly y: number }[] {
  return [
    { x: 0, y: -2 }, { x: -2, y: 0 }, { x: 2, y: 0 }, { x: -3, y: 2 },
    { x: 3, y: 2 }, { x: -2, y: 4 }, { x: 2, y: 4 }, { x: 0, y: 6 },
  ];
}

function ratio(ticks: number, duration: number): number {
  return fp.div(fp.fromInt(Math.max(0, Math.min(ticks, duration))), fp.fromInt(duration));
}

function lerp(start: number, end: number, t: number): number {
  return fp.toFloat(fp.add(fp.fromFloat(start), fp.mul(fp.fromFloat(end - start), t)));
}

function lerpPoint(start: { readonly x: number; readonly y: number }, end: { readonly x: number; readonly y: number }, t: number) {
  return { x: lerp(start.x, end.x, t), y: lerp(start.y, end.y, t) };
}

function formForAge(ageTicks: number): string {
  const phase = Math.floor(ageTicks / 16) % 3;
  return phase === 0 ? "default" : phase === 1 ? "turn" : "move";
}
