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
  type NeutralMobState,
} from "@repo/types";

import { FP_2, FP_PI } from "../../../../fp";
import { fpAtan2 } from "../../../../fp";
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

export type CollaborateEliteVariant = "silly" | "plain" | "happy";
export type CollaborateEliteSide = "left" | "center" | "right";

export interface CollaborateEliteFairyState extends NeutralMobState {
  readonly kind: "collaborate_elite_fairy";
  variant: CollaborateEliteVariant;
  side: CollaborateEliteSide;
  nextFireAge: number;
  fireSubphase: number;
}

type BoundedMobActionContext = NeutralMobActionContext<
  BattleBulletSpawnParams,
  BattleLaserSpawnParams
> & {
  readonly arenaBounds: ArenaBounds;
};

const HIT_RADIUS = Math.round(36 * 1.8);
const ENTER_TICKS = secondsToTicks(1.4);
const SILLY_PLAN: SpellCardPlan = {
  nonSpellMaxHealth: 320,
  nonSpellThresholdHealth: 180,
  spellCards: [
    {
      id: "ice-crystal-joke",
      displayName: "冰晶玩笑",
      maxHealth: 280,
      durationTicks: secondsToTicks(20),
    },
    {
      id: "frozen-stardust",
      displayName: "冻结星屑",
      maxHealth: 340,
      durationTicks: secondsToTicks(24),
    },
  ],
};
const PLAIN_PLAN: SpellCardPlan = {
  nonSpellMaxHealth: 360,
  nonSpellThresholdHealth: 210,
  spellCards: [
    {
      id: "orderly-barrage",
      displayName: "规整弹幕",
      maxHealth: 320,
      durationTicks: secondsToTicks(22),
    },
  ],
};
const HAPPY_PLAN: SpellCardPlan = {
  nonSpellMaxHealth: 340,
  nonSpellThresholdHealth: 200,
  spellCards: [
    {
      id: "happy-diffusion",
      displayName: "快乐扩散",
      maxHealth: 320,
      durationTicks: secondsToTicks(22),
    },
  ],
};

const CIRCLE_24_STEP = fp.div(fp.mul(FP_2, FP_PI), fp.fromInt(24));
const CIRCLE_18_STEP = fp.div(fp.mul(FP_2, FP_PI), fp.fromInt(18));
const CIRCLE_12_STEP = fp.div(fp.mul(FP_2, FP_PI), fp.fromInt(12));

export class CollaborateEliteFairy extends NeutralMob<
  CollaborateEliteFairyState,
  BattleBulletSpawnParams,
  BattleLaserSpawnParams
> {
  readonly state: CollaborateEliteFairyState;

  constructor(params: {
    readonly id: number;
    readonly waveId: number;
    readonly variant: CollaborateEliteVariant;
    readonly side: CollaborateEliteSide;
    readonly pointRewardSize?: PointRewardSize;
    readonly moneyRewardSize?: MoneyRewardSize;
    readonly powerRewardSize?: PowerRewardSize;
    readonly arenaBounds?: ArenaBounds;
  }) {
    super();
    const bounds = params.arenaBounds ?? DEFAULT_ARENA_BOUNDS;
    const x = sideX(params.side, bounds);
    const plan = spellPlanForVariant(params.variant);
    this.state = {
      id: params.id,
      key: "Neutral",
      kind: "collaborate_elite_fairy",
      class: "elite",
      displayName: displayNameForVariant(params.variant),
      textureKey: "enemy_type_7",
      characterId: characterIdForVariant(params.variant),
      x,
      y: -HIT_RADIUS,
      previousX: x,
      previousY: -HIT_RADIUS,
      hitRadius: HIT_RADIUS,
      waveId: params.waveId,
      movementVariant: params.variant,
      variant: params.variant,
      side: params.side,
      form: "entering",
      MaxHealth: plan.nonSpellMaxHealth,
      CurrentHealth: plan.nonSpellMaxHealth,
      pointRewardSize: params.pointRewardSize,
      moneyRewardSize: params.moneyRewardSize,
      powerRewardSize: params.powerRewardSize,
      spellCard: createSpellCardState(plan),
      active: true,
      ageTicks: 0,
      nextFireAge: ENTER_TICKS,
      fireSubphase: 0,
      sfxFlags: 0,
    };
  }

  static fromSnapshot(snapshot: NeutralMobState): CollaborateEliteFairy {
    const s = snapshot as CollaborateEliteFairyState;
    const mob = new CollaborateEliteFairy({
      id: s.id,
      waveId: s.waveId,
      variant: normalizeVariant(s.variant),
      side: normalizeSide(s.side),
    });
    mob.restore(s);
    return mob;
  }

  onDeathEffect(): void {
    // Reward drops are handled from state by PointManager.
  }

  onDeath(): void {
    // No extra side effects.
  }

  move(ctx: BoundedMobActionContext): void {
    if (this.state.ageTicks <= ENTER_TICKS) {
      const t = ratio(this.state.ageTicks, ENTER_TICKS);
      this.state.x = sideX(this.state.side, ctx.arenaBounds);
      this.state.y = lerp(-HIT_RADIUS, anchorY(this.state.side, ctx.arenaBounds), t);
      this.state.form = "entering";
      return;
    }

    this.state.x = this.motionX(ctx.arenaBounds);
    this.state.y = anchorY(this.state.side, ctx.arenaBounds);
    this.syncHealthFromSpellCard();
    this.state.form = this.state.spellCard?.phase ?? "firing";
  }

  fire(
    ctx: NeutralMobActionContext<
      BattleBulletSpawnParams,
      BattleLaserSpawnParams
    >,
  ): void {
    if (!this.state.spellCard || this.state.ageTicks < this.state.nextFireAge) {
      return;
    }

    if (this.state.spellCard.phase === "non_spell") {
      this.fireNonSpell(ctx);
    } else {
      this.fireSpell(ctx);
    }
    this.state.fireSubphase += 1;
  }

  switchForm(): void {
    if (!this.state.spellCard) {
      return;
    }
    const result = tickSpellCardState(this.state.spellCard);
    this.state.spellCard = result.state;
    this.syncHealthFromSpellCard();
    if (result.defeated) {
      this.state.active = false;
    }
  }

  die(): void {
    if (this.state.CurrentHealth <= 0 && !this.state.spellCard) {
      this.state.active = false;
    }
  }

  onProjectileHit(damage: number): "accepted" | "ignored" {
    if (!this.state.active || damage <= 0) {
      return "ignored";
    }
    if (this.state.spellCard) {
      const result = applySpellCardDamage(this.state.spellCard, damage);
      this.state.spellCard = result.state;
      this.syncHealthFromSpellCard();
      if (result.defeated) {
        this.state.active = false;
      }
      return "accepted";
    }
    this.state.CurrentHealth = Math.max(0, this.state.CurrentHealth - damage);
    if (this.state.CurrentHealth <= 0) {
      this.state.active = false;
    }
    return "accepted";
  }

  private fireNonSpell(
    ctx: NeutralMobActionContext<
      BattleBulletSpawnParams,
      BattleLaserSpawnParams
    >,
  ): void {
    switch (this.state.variant) {
      case "silly":
        this.fireSillyFan(ctx);
        this.state.nextFireAge = this.state.ageTicks + secondsToTicks(0.85);
        return;
      case "plain":
        this.firePlainThreeWay(ctx);
        this.state.nextFireAge = this.state.ageTicks + secondsToTicks(0.65);
        return;
      case "happy":
        this.fireHappyArc(ctx);
        this.state.nextFireAge = this.state.ageTicks + secondsToTicks(0.7);
        return;
    }
  }

  private fireSpell(
    ctx: NeutralMobActionContext<
      BattleBulletSpawnParams,
      BattleLaserSpawnParams
    >,
  ): void {
    const spellId = this.state.spellCard?.spellCards[
      this.state.spellCard.spellCardIndex
    ]?.id;
    switch (spellId) {
      case "ice-crystal-joke":
        this.fireOffsetRing(ctx, 18, CIRCLE_18_STEP, "medium", 0.2);
        this.state.nextFireAge = this.state.ageTicks + secondsToTicks(0.55);
        return;
      case "frozen-stardust":
        this.fireStar(ctx);
        this.state.nextFireAge =
          this.state.ageTicks + Math.max(12, secondsToTicks(0.5) - this.state.fireSubphase);
        return;
      case "orderly-barrage":
        this.fireOffsetRing(ctx, 24, CIRCLE_24_STEP, "medium", 0.13);
        this.state.nextFireAge = this.state.ageTicks + secondsToTicks(0.45);
        return;
      case "happy-diffusion":
        this.fireHappyDiffusion(ctx);
        this.state.nextFireAge = this.state.ageTicks + secondsToTicks(0.5);
        return;
      default:
        this.state.nextFireAge = this.state.ageTicks + secondsToTicks(1);
    }
  }

  private fireSillyFan(
    ctx: NeutralMobActionContext<
      BattleBulletSpawnParams,
      BattleLaserSpawnParams
    >,
  ): void {
    const target = this.state.fireSubphase % 2 === 0 ? ctx.player : ctx.target;
    const baseAngle = fpAtan2(
      fp.fromFloat(target.y - this.state.y),
      fp.fromFloat(target.x - this.state.x),
    );
    for (let i = -2; i <= 2; i += 1) {
      this.spawnBullet(ctx, baseAngle + i * 0.14, "low", "bullet_type_3_offset_12", 12);
    }
  }

  private firePlainThreeWay(
    ctx: NeutralMobActionContext<
      BattleBulletSpawnParams,
      BattleLaserSpawnParams
    >,
  ): void {
    const base = Math.PI / 2 + (this.state.fireSubphase % 2) * 0.22;
    for (const offset of [-0.32, 0, 0.32]) {
      this.spawnBullet(ctx, base + offset, "medium", "bullet_type_21_offset_1", 8);
    }
  }

  private fireHappyArc(
    ctx: NeutralMobActionContext<
      BattleBulletSpawnParams,
      BattleLaserSpawnParams
    >,
  ): void {
    const direction = this.state.fireSubphase % 2 === 0 ? 1 : -1;
    for (let i = 0; i < 7; i += 1) {
      const angle = Math.PI / 2 + direction * (-0.54 + i * 0.18);
      this.spawnBullet(ctx, angle, "low", "bullet_type_3_offset_6", 12);
    }
  }

  private fireOffsetRing(
    ctx: NeutralMobActionContext<
      BattleBulletSpawnParams,
      BattleLaserSpawnParams
    >,
    count: number,
    step: number,
    speedRank: BattleBulletSpawnParams["speedRank"],
    turn: number,
  ): void {
    const base = this.state.fireSubphase * turn;
    for (let i = 0; i < count; i += 1) {
      this.spawnBullet(
        ctx,
        base + fp.toFloat(fp.mul(fp.fromInt(i), step) as number),
        speedRank,
        "bullet_type_3_offset_12",
        11,
      );
    }
  }

  private fireStar(
    ctx: NeutralMobActionContext<
      BattleBulletSpawnParams,
      BattleLaserSpawnParams
    >,
  ): void {
    const base = this.state.fireSubphase * 0.19;
    for (let i = 0; i < 5; i += 1) {
      const angle = base + i * ((Math.PI * 2) / 5);
      this.spawnBullet(ctx, angle, "medium", "bullet_type_21_offset_1", 9);
      this.spawnBullet(ctx, angle + 0.16, "low", "bullet_type_3_offset_6", 10);
    }
  }

  private fireHappyDiffusion(
    ctx: NeutralMobActionContext<
      BattleBulletSpawnParams,
      BattleLaserSpawnParams
    >,
  ): void {
    const origins = [-120, 0, 120];
    const originOffset = origins[this.state.fireSubphase % origins.length] ?? 0;
    const oldX = this.state.x;
    this.state.x += originOffset;
    this.fireOffsetRing(ctx, 12, CIRCLE_12_STEP, "medium", 0.25);
    this.state.x = oldX;
  }

  private spawnBullet(
    ctx: NeutralMobActionContext<
      BattleBulletSpawnParams,
      BattleLaserSpawnParams
    >,
    angle: number,
    speedRank: BattleBulletSpawnParams["speedRank"],
    textureKey: string,
    size: number,
  ): void {
    ctx.spawnBullet({
      owner: "Neutral",
      textureKey,
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

  private motionX(bounds: ArenaBounds): number {
    if (this.state.variant !== "happy") {
      return sideX(this.state.side, bounds);
    }
    const anchor = sideX(this.state.side, bounds);
    const cycleTicks = secondsToTicks(4);
    const elapsed = Math.max(0, this.state.ageTicks - ENTER_TICKS);
    const phase = elapsed % cycleTicks;
    const halfCycle = cycleTicks / 2;
    const triangle =
      phase < halfCycle
        ? phase / halfCycle
        : 1 - (phase - halfCycle) / halfCycle;
    return anchor + (triangle * 2 - 1) * 130;
  }

  private syncHealthFromSpellCard(): void {
    if (!this.state.spellCard) {
      return;
    }
    this.state.MaxHealth = this.state.spellCard.maxHealth;
    this.state.CurrentHealth = this.state.spellCard.currentHealth;
  }
}

function spellPlanForVariant(variant: CollaborateEliteVariant): SpellCardPlan {
  switch (variant) {
    case "silly":
      return SILLY_PLAN;
    case "plain":
      return PLAIN_PLAN;
    case "happy":
      return HAPPY_PLAN;
  }
}

function displayNameForVariant(variant: CollaborateEliteVariant): string {
  switch (variant) {
    case "silly":
      return "笨蛋小精英";
    case "plain":
      return "朴实精英";
    case "happy":
      return "开心精英";
  }
}

function characterIdForVariant(
  variant: CollaborateEliteVariant,
): CollaborateEliteFairyState["characterId"] {
  switch (variant) {
    case "silly":
      return "cirno";
    case "plain":
      return "sakuya";
    case "happy":
      return "reimu";
  }
}

function normalizeVariant(value: string): CollaborateEliteVariant {
  return value === "plain" || value === "happy" ? value : "silly";
}

function normalizeSide(value: string): CollaborateEliteSide {
  return value === "left" || value === "right" ? value : "center";
}

function sideX(side: CollaborateEliteSide, bounds: ArenaBounds): number {
  if (side === "left") return bounds.width * 0.33;
  if (side === "right") return bounds.width * 0.67;
  return bounds.width * 0.5;
}

function anchorY(side: CollaborateEliteSide, bounds: ArenaBounds): number {
  return side === "center" ? bounds.height * 0.36 : bounds.height * 0.34;
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
