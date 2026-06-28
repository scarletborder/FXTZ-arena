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

export interface CollaborateBossFairyState extends NeutralMobState {
  readonly kind: "collaborate_boss_fairy";
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

const HIT_RADIUS = Math.round(36 * 2.1);
const ENTER_TICKS = secondsToTicks(1.8);
const BOSS_PLAN: SpellCardPlan = {
  nonSpellMaxHealth: 620,
  nonSpellThresholdHealth: 360,
  spellCards: [
    {
      id: "mad-opening",
      displayName: "狂乱开幕",
      maxHealth: 520,
      durationTicks: secondsToTicks(25),
    },
    {
      id: "uncontrolled-paradise",
      displayName: "失控乐园",
      maxHealth: 560,
      durationTicks: secondsToTicks(30),
    },
    {
      id: "mad-finale",
      displayName: "疯狂终局",
      maxHealth: 700,
      durationTicks: secondsToTicks(35),
    },
  ],
};

const CIRCLE_36_STEP = fp.div(fp.mul(FP_2, FP_PI), fp.fromInt(36));
const CIRCLE_24_STEP = fp.div(fp.mul(FP_2, FP_PI), fp.fromInt(24));

export class CollaborateBossFairy extends NeutralMob<
  CollaborateBossFairyState,
  BattleBulletSpawnParams,
  BattleLaserSpawnParams
> {
  readonly state: CollaborateBossFairyState;

  constructor(params: {
    readonly id: number;
    readonly waveId: number;
    readonly pointRewardSize?: PointRewardSize;
    readonly moneyRewardSize?: MoneyRewardSize;
    readonly powerRewardSize?: PowerRewardSize;
    readonly arenaBounds?: ArenaBounds;
    readonly rngSeed?: number;
  }) {
    super();
    const bounds = params.arenaBounds ?? DEFAULT_ARENA_BOUNDS;
    const x = bounds.width / 2;
    this.state = {
      id: params.id,
      key: "Neutral",
      kind: "collaborate_boss_fairy",
      class: "boss",
      displayName: "疯狂boss",
      textureKey: "enemy_type_7",
      characterId: "marisa",
      x,
      y: -HIT_RADIUS,
      previousX: x,
      previousY: -HIT_RADIUS,
      hitRadius: HIT_RADIUS,
      waveId: params.waveId,
      movementVariant: "boss",
      form: "entering",
      MaxHealth: BOSS_PLAN.nonSpellMaxHealth,
      CurrentHealth: BOSS_PLAN.nonSpellMaxHealth,
      pointRewardSize: params.pointRewardSize,
      moneyRewardSize: params.moneyRewardSize,
      powerRewardSize: params.powerRewardSize,
      spellCard: createSpellCardState(BOSS_PLAN),
      active: true,
      ageTicks: 0,
      nextFireAge: ENTER_TICKS,
      fireSubphase: 0,
      rngState: params.rngSeed ?? 0x51f15e,
      sfxFlags: 0,
    };
  }

  static fromSnapshot(snapshot: NeutralMobState): CollaborateBossFairy {
    const s = snapshot as CollaborateBossFairyState;
    const mob = new CollaborateBossFairy({
      id: s.id,
      waveId: s.waveId,
      rngSeed: s.rngState,
    });
    mob.restore(s);
    return mob;
  }

  onDeathEffect(): void {
    // Boss victory is handled by BattleModel when the boss class is defeated.
  }

  onDeath(): void {
    // No extra side effects.
  }

  move(ctx: BoundedMobActionContext): void {
    const anchorX = ctx.arenaBounds.width / 2;
    const anchorY = ctx.arenaBounds.height * 0.24;
    if (this.state.ageTicks <= ENTER_TICKS) {
      const t = ratio(this.state.ageTicks, ENTER_TICKS);
      this.state.x = anchorX;
      this.state.y = lerp(-HIT_RADIUS, anchorY, t);
      this.state.form = "entering";
      return;
    }

    const swayPhase = Math.floor(
      (this.state.ageTicks - ENTER_TICKS) / secondsToTicks(1),
    );
    const sway = (swayPhase % 5) - 2;
    this.state.x = anchorX + sway * 24;
    this.state.y = anchorY;
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
      if (this.state.spellCard.spellCardIndex === 0) {
        this.fireWidePressure(ctx);
        this.state.nextFireAge = this.state.ageTicks + secondsToTicks(0.55);
      } else {
        this.fireAlternatingSnipes(ctx);
        this.state.nextFireAge = this.state.ageTicks + secondsToTicks(0.45);
      }
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

  private fireWidePressure(
    ctx: NeutralMobActionContext<
      BattleBulletSpawnParams,
      BattleLaserSpawnParams
    >,
  ): void {
    const base = Math.PI / 2 - 0.72 + (this.state.fireSubphase % 2) * 0.08;
    for (let i = 0; i < 9; i += 1) {
      this.spawnBullet(
        ctx,
        base + i * 0.18,
        "low",
        "bullet_type_3_offset_12",
        14,
      );
    }
  }

  private fireAlternatingSnipes(
    ctx: NeutralMobActionContext<
      BattleBulletSpawnParams,
      BattleLaserSpawnParams
    >,
  ): void {
    const target = this.state.fireSubphase % 2 === 0 ? ctx.player : ctx.target;
    const angle = fpAtan2(
      fp.fromFloat(target.y - this.state.y),
      fp.fromFloat(target.x - this.state.x),
    );
    for (const offset of [-0.08, 0, 0.08]) {
      this.spawnBullet(
        ctx,
        angle + offset,
        "high",
        "bullet_type_21_offset_1",
        7,
      );
    }
  }

  private fireSpell(
    ctx: NeutralMobActionContext<
      BattleBulletSpawnParams,
      BattleLaserSpawnParams
    >,
  ): void {
    const spellId =
      this.state.spellCard?.spellCards[this.state.spellCard.spellCardIndex]?.id;
    switch (spellId) {
      case "mad-opening":
        this.fireRotatingRings(ctx);
        this.state.nextFireAge = this.state.ageTicks + secondsToTicks(0.4);
        return;
      case "uncontrolled-paradise":
        this.fireSeededChaos(ctx);
        this.state.nextFireAge = this.state.ageTicks + secondsToTicks(0.28);
        return;
      case "mad-finale":
        this.fireFinale(ctx);
        this.state.nextFireAge = this.state.ageTicks + secondsToTicks(0.36);
        return;
      default:
        this.state.nextFireAge = this.state.ageTicks + secondsToTicks(1);
    }
  }

  private fireRotatingRings(
    ctx: NeutralMobActionContext<
      BattleBulletSpawnParams,
      BattleLaserSpawnParams
    >,
  ): void {
    const base = this.state.fireSubphase * 0.11;
    for (let layer = 0; layer < 2; layer += 1) {
      for (let i = 0; i < 24; i += 1) {
        const angle =
          base +
          layer * 0.13 +
          fp.toFloat(fp.mul(fp.fromInt(i), CIRCLE_24_STEP) as number);
        this.spawnBullet(
          ctx,
          angle,
          layer === 0 ? "low" : "medium",
          layer === 0 ? "bullet_type_3_offset_6" : "bullet_type_3_offset_12",
          layer === 0 ? 10 : 12,
        );
      }
    }
  }

  private fireSeededChaos(
    ctx: NeutralMobActionContext<
      BattleBulletSpawnParams,
      BattleLaserSpawnParams
    >,
  ): void {
    for (let i = 0; i < 7; i += 1) {
      const angle = this.nextUnit() * Math.PI * 2;
      const speedRank = this.nextUnit() < 0.55 ? "low" : "medium";
      this.spawnBullet(ctx, angle, speedRank, "bullet_type_21_offset_1", 7);
    }
  }

  private fireFinale(
    ctx: NeutralMobActionContext<
      BattleBulletSpawnParams,
      BattleLaserSpawnParams
    >,
  ): void {
    const base = this.state.fireSubphase * 0.17;
    for (let i = 0; i < 36; i += 1) {
      if (i % 3 === this.state.fireSubphase % 3) {
        continue;
      }
      this.spawnBullet(
        ctx,
        base + fp.toFloat(fp.mul(fp.fromInt(i), CIRCLE_36_STEP) as number),
        "medium",
        "bullet_type_3_offset_12",
        11,
      );
    }
    this.fireAlternatingSnipes(ctx);
    if (this.state.fireSubphase % 3 === 0) {
      this.fireHorizontalSweep(ctx);
    }
  }

  private fireHorizontalSweep(
    ctx: NeutralMobActionContext<
      BattleBulletSpawnParams,
      BattleLaserSpawnParams
    >,
  ): void {
    const yOffset = (this.state.fireSubphase % 5) * 34;
    for (const direction of [0, Math.PI] as const) {
      ctx.spawnBullet({
        owner: ctx.owner,
        textureKey: "bullet_type_3_offset_6",
        kind: "orb",
        x: this.state.x + (direction === 0 ? -220 : 220),
        y: this.state.y + yOffset,
        angle: direction,
        speedRank: "medium",
        width: 14,
        height: 14,
        homingTicks: 0,
        spawnOffset: 0,
      });
    }
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
      owner: ctx.owner,
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

  private nextUnit(): number {
    this.state.rngState = lcg(this.state.rngState);
    return (this.state.rngState & 0xffff) / 0x10000;
  }

  private syncHealthFromSpellCard(): void {
    if (!this.state.spellCard) {
      return;
    }
    this.state.MaxHealth = this.state.spellCard.maxHealth;
    this.state.CurrentHealth = this.state.spellCard.currentHealth;
  }
}

function lcg(seed: number): number {
  return (Math.imul(seed, 1664525) + 1013904223) >>> 0;
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
