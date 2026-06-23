import { fp } from "@shaisrc/fixed-point";
import { DEFAULT_ARENA_BOUNDS, type ArenaBounds } from "@repo/constants";
import type { PointRewardSize } from "@repo/constants";
import {
  NeutralMob,
  type NeutralMobActionContext,
  type NeutralMobDeathSource,
  type NeutralMobState,
} from "@repo/types";

import { FP_2, FP_PI } from "../../fp";
import {
  hitCircleUnits,
  secondsToTicks,
  type BattleBulletSpawnParams,
  type BattleLaserSpawnParams,
} from "../../characters/base";
import {
  applySpellCardDamage,
  createSpellCardState,
  tickSpellCardState,
  type SpellCardPlan,
} from "../collaborate/spell-card";

export type EliteFairySide = "left" | "right";
export type EliteFairyPhase = "entering" | "aiming" | "firing" | "retreating";

export interface EliteFairyState extends NeutralMobState {
  readonly kind: "elite_fairy";
  side: EliteFairySide;
  phase: EliteFairyPhase;
  /** ageTicks at which to transition to the next phase. */
  phaseEndAge: number;
}

type BoundedMobActionContext = NeutralMobActionContext<
  BattleBulletSpawnParams,
  BattleLaserSpawnParams
> & {
  readonly arenaBounds: ArenaBounds;
};

const MAX_HEALTH = 800;
const SPELL_CARD_PLAN: SpellCardPlan = {
  nonSpellMaxHealth: MAX_HEALTH,
  nonSpellThresholdHealth: 650,
  spellCards: [
    {
      id: "ice-crystal-joke",
      displayName: "冰晶玩笑",
      maxHealth: 800,
      durationTicks: secondsToTicks(20),
    },
    {
      id: "frozen-stardust",
      displayName: "冻结星屑",
      maxHealth: 1200,
      durationTicks: secondsToTicks(24),
    },
  ],
};
const HIT_RADIUS = Math.round(36 * 1.8); // 65
const ENTER_TICKS = secondsToTicks(1.2);
const AIM_TICKS = secondsToTicks(0.5);
const FIRE_DURATION_TICKS = secondsToTicks(6);
const FIRE_INTERVAL_TICKS = secondsToTicks(1.2);

/** Circle of 18 bullets: angle step = 2π/18 */
const CIRCLE_STEP = fp.div(fp.mul(FP_2, FP_PI), fp.fromInt(18));

const RETREAT_TICKS = secondsToTicks(4);

function centerY(bounds: ArenaBounds): number {
  return bounds.height / 2;
}

function retreatY(bounds: ArenaBounds): number {
  return bounds.height * 0.6;
}

function sideX(side: EliteFairySide, bounds: ArenaBounds): number {
  return side === "left" ? bounds.width * 0.25 : bounds.width * 0.75;
}

function retreatX(side: EliteFairySide, bounds: ArenaBounds): number {
  return side === "left"
    ? -hitCircleUnits(12)
    : bounds.width + hitCircleUnits(12);
}

export class EliteFairy extends NeutralMob<
  EliteFairyState,
  BattleBulletSpawnParams,
  BattleLaserSpawnParams
> {
  readonly state: EliteFairyState;

  constructor(params: {
    readonly id: number;
    readonly waveId: number;
    readonly side: EliteFairySide;
    readonly pointRewardSize?: PointRewardSize;
    readonly arenaBounds?: ArenaBounds;
  }) {
    super();
    const bounds = params.arenaBounds ?? DEFAULT_ARENA_BOUNDS;
    const x = sideX(params.side, bounds);
    this.state = {
      id: params.id,
      key: "Neutral",
      kind: "elite_fairy",
      class: "elite",
      displayName: "笨蛋小精英",
      textureKey: "enemy_type_7",
      x,
      y: -HIT_RADIUS,
      previousX: x,
      previousY: -HIT_RADIUS,
      hitRadius: HIT_RADIUS,
      waveId: params.waveId,
      movementVariant: params.side,
      form: "entering",
      side: params.side,
      phase: "entering",
      phaseEndAge: ENTER_TICKS,
      pointRewardSize: params.pointRewardSize,
      MaxHealth: MAX_HEALTH,
      CurrentHealth: MAX_HEALTH,
      spellCard: createSpellCardState(SPELL_CARD_PLAN),
      active: true,
      ageTicks: 0,
      sfxFlags: 0,
    };
  }

  static fromSnapshot(snapshot: NeutralMobState): EliteFairy {
    const s = snapshot as EliteFairyState;
    const mob = new EliteFairy({
      id: s.id,
      waveId: s.waveId,
      side: s.side === "right" ? "right" : "left",
    });
    mob.restore(s);
    return mob;
  }

  onDeathEffect(): void {
    // No-op for EliteFairy.
  }

  onDeath(_source: NeutralMobDeathSource): void {
    // Drops large point — handled by pointRewardSize in spawner.
  }

  move(ctx: BoundedMobActionContext): void {
    this.state.form = this.state.phase;

    if (this.state.spellCard) {
      if (this.state.ageTicks <= ENTER_TICKS) {
        const t = ratio(this.state.ageTicks, ENTER_TICKS);
        this.state.phase = "entering";
        this.state.form = "entering";
        this.state.x = sideX(this.state.side, ctx.arenaBounds);
        this.state.y = lerp(-HIT_RADIUS, centerY(ctx.arenaBounds), t);
        return;
      }
      this.state.phase = "firing";
      this.state.form = this.state.spellCard.phase;
      this.state.x = sideX(this.state.side, ctx.arenaBounds);
      this.state.y = centerY(ctx.arenaBounds);
      this.syncHealthFromSpellCard();
      return;
    }

    switch (this.state.phase) {
      case "entering": {
        // High-speed vertical descent from top to center
        const t = ratio(this.state.ageTicks, this.state.phaseEndAge);
        this.state.x = sideX(this.state.side, ctx.arenaBounds);
        this.state.y = lerp(-HIT_RADIUS, centerY(ctx.arenaBounds), t);

        if (this.state.ageTicks >= this.state.phaseEndAge) {
          this.state.phase = "aiming";
          this.state.phaseEndAge = this.state.ageTicks + AIM_TICKS;
        }
        break;
      }

      case "aiming": {
        // Wait at center position
        this.state.x = sideX(this.state.side, ctx.arenaBounds);
        this.state.y = centerY(ctx.arenaBounds);

        if (this.state.ageTicks >= this.state.phaseEndAge) {
          this.state.phase = "firing";
          this.state.phaseEndAge = this.state.ageTicks + FIRE_DURATION_TICKS;
        }
        break;
      }

      case "firing": {
        // Stay at center while firing
        this.state.x = sideX(this.state.side, ctx.arenaBounds);
        this.state.y = centerY(ctx.arenaBounds);

        if (this.state.ageTicks >= this.state.phaseEndAge) {
          this.state.phase = "retreating";
          this.state.phaseEndAge = this.state.ageTicks + RETREAT_TICKS;
        }
        break;
      }

      case "retreating": {
        // Low-speed retreat toward the side exit
        const elapsed =
          this.state.ageTicks - (this.state.phaseEndAge - RETREAT_TICKS);
        const t = ratio(elapsed, RETREAT_TICKS);
        this.state.x = lerp(
          sideX(this.state.side, ctx.arenaBounds),
          retreatX(this.state.side, ctx.arenaBounds),
          t,
        );
        this.state.y = lerp(
          centerY(ctx.arenaBounds),
          retreatY(ctx.arenaBounds),
          t,
        );
        break;
      }
    }
  }

  fire(
    ctx: NeutralMobActionContext<
      BattleBulletSpawnParams,
      BattleLaserSpawnParams
    >,
  ): void {
    if (this.state.phase !== "firing") {
      return;
    }

    // Fire a volley of 18 bullets in a circle
    const ageInPhase =
      this.state.ageTicks - (this.state.phaseEndAge - FIRE_DURATION_TICKS);
    if (ageInPhase % FIRE_INTERVAL_TICKS !== 0) {
      return;
    }

    for (let i = 0; i < 18; i++) {
      const angle = fp.toFloat(fp.mul(fp.fromInt(i), CIRCLE_STEP) as number);
      ctx.spawnBullet({
        owner: "Neutral",
        textureKey: "bullet_type_3_offset_12",
        kind: "orb",
        x: this.state.x,
        y: this.state.y,
        angle,
        speedRank: "medium",
        width: 10,
        height: 10,
        homingTicks: 0,
        spawnOffset: 0,
      });
    }
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
    if (this.state.spellCard) {
      if (this.state.CurrentHealth <= 0) {
        this.state.active = false;
      }
      return;
    }
    if (
      this.state.CurrentHealth <= 0 ||
      (this.state.phase === "retreating" &&
        this.state.ageTicks >= this.state.phaseEndAge)
    ) {
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

  private syncHealthFromSpellCard(): void {
    if (!this.state.spellCard) {
      return;
    }
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
