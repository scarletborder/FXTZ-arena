import {
  bulletSpeedRankToPixelsPerTick,
  FamiliarMob,
  type FamiliarMobState,
  type NeutralMobActionContext,
  type NeutralMobTargetState,
} from "@repo/types";

import type {
  BattleBulletSpawnParams,
  BattleLaserSpawnParams,
} from "../characters/base";
import { hitCircleUnits, secondsToTicks } from "../characters/base";
import { registerFamiliarSnapshotFactory } from "../characters/familiar-snapshot";
import {
  createDefaultFamiliarState,
  DEFAULT_FAMILIAR_TEXTURE_KEY,
  syncDefaultFamiliarMotion,
  type DefaultFamiliarState,
} from "../characters/default-familiar";
import { Vanilla } from "../decorators";
import {
  applySpellCardDamage,
  createSpellCardState,
  tickSpellCardState,
  type SpellCardPlan,
} from "../mob-spawner/collaborate/spell-card";
import type { AbilityCardDefinition } from "./types";
import { BattleAbilityCard, type BattleCardContext } from "./base";

export const WHITECAT_FAMILIAR_KIND = "whitecat_familiar";
export const WHITECAT_NON_SPELL_HEALTH = 800;
export const WHITECAT_SPELL_HEALTH = 600;
export const WHITECAT_LEAP_INTERVAL_TICKS = secondsToTicks(1.8);
export const WHITECAT_LEAP_DURATION_TICKS = secondsToTicks(0.5);
export const WHITECAT_SNIPE_BULLET_COUNT = 5;
export const WHITECAT_WHEEL_BULLET_COUNT = 8;
export const WHITECAT_WHEEL_INTERVAL_TICKS = 6;
export const WHITECAT_BULLET_TEXTURE = "bullet_type_10_offset_3";

const WHITECAT_RADIUS = 18;
const WHITECAT_LEAP_DISTANCE = hitCircleUnits(5.5);
const WHITECAT_BULLET_SIZE = 16;
const WHITECAT_SNIPE_DAMAGE = 18;
const WHITECAT_WHEEL_DAMAGE = 8;
const WHITECAT_SPELL_MOVE_SPEED = bulletSpeedRankToPixelsPerTick("low");
const FULL_CIRCLE = Math.PI * 2;

const WHITECAT_SPELL_PLAN: SpellCardPlan = {
  nonSpellMaxHealth: WHITECAT_NON_SPELL_HEALTH,
  nonSpellThresholdHealth: 0,
  spellCards: [
    {
      id: "whitecat-pinwheel",
      displayName: "Socrates「猫之行径」",
      maxHealth: WHITECAT_SPELL_HEALTH,
      durationTicks: secondsToTicks(24),
    },
  ],
};

export class WhitecatBattleCard extends BattleAbilityCard {
  readonly id: AbilityCardDefinition["id"] = "whitecat";
  readonly name = "content.ability_cards.whitecat.name";
  readonly cost = 3;
  readonly kind = "active" as AbilityCardDefinition["kind"];
  readonly useLimit: AbilityCardDefinition["useLimit"] = 1;
  readonly cooldownTicks = 0;
  readonly description = "content.ability_cards.whitecat.description";
  readonly gallery: AbilityCardDefinition["gallery"] = {
    iconAsset: "assets/ability-cards/whitecat/icon.png",
  };

  onUse(ctx: BattleCardContext): void {
    if (!ctx.spawnMob || !ctx.allocateMobId || ctx.self.key === "Neutral") {
      return;
    }
    const lockedTarget = nearestEnemyToAim(ctx);
    ctx.spawnMob(
      new WhitecatFamiliar(
        ctx.allocateMobId(),
        ctx.self.key,
        ctx.self.x,
        ctx.self.y,
        lockedTarget,
      ),
    );
  }
}

Vanilla.registerCard("whitecat")(WhitecatBattleCard);

export interface WhitecatFamiliarState
  extends DefaultFamiliarState<typeof WHITECAT_FAMILIAR_KIND> {
  readonly sourceAbilityCardId: "whitecat";
  lockedTargetKey?: FamiliarMobState["key"] | "Neutral";
  lockedTargetMobId?: number;
  lockedTargetX: number;
  lockedTargetY: number;
  jumpedThisTick: boolean;
  nextLeapAt: number;
  leapTicksRemaining: number;
  leapTargetX: number;
  leapTargetY: number;
}

class WhitecatFamiliar extends FamiliarMob<
  WhitecatFamiliarState,
  BattleBulletSpawnParams,
  BattleLaserSpawnParams
> {
  readonly state: WhitecatFamiliarState;

  constructor(
    id: number,
    owner: Exclude<FamiliarMobState["key"], "Neutral">,
    x: number,
    y: number,
    lockedTarget: WhitecatLockedTarget | undefined,
  ) {
    super();
    this.state = {
      ...createDefaultFamiliarState({
        id,
        key: owner,
        kind: WHITECAT_FAMILIAR_KIND,
        x,
        y,
        health: WHITECAT_NON_SPELL_HEALTH,
        radius: WHITECAT_RADIUS,
      }),
      sourceAbilityCardId: "whitecat",
      textureKey: DEFAULT_FAMILIAR_TEXTURE_KEY,
      class: "elite",
      displayName: "Socrates使魔",
      spellCard: createSpellCardState(WHITECAT_SPELL_PLAN),
      lockedTargetKey: lockedTarget?.key,
      lockedTargetMobId: lockedTarget?.mobId,
      lockedTargetX: lockedTarget?.x ?? x,
      lockedTargetY: lockedTarget?.y ?? y,
      jumpedThisTick: false,
      nextLeapAt: WHITECAT_LEAP_INTERVAL_TICKS,
      leapTicksRemaining: 0,
      leapTargetX: x,
      leapTargetY: y,
    };
  }

  static fromSnapshot(snapshot: WhitecatFamiliarState): WhitecatFamiliar {
    const mob = new WhitecatFamiliar(
      snapshot.id,
      playerOwner(snapshot.key),
      snapshot.x,
      snapshot.y,
      undefined,
    );
    mob.restore(snapshot);
    return mob;
  }

  move(
    ctx: NeutralMobActionContext<
      BattleBulletSpawnParams,
      BattleLaserSpawnParams
    >,
  ): void {
    this.state.jumpedThisTick = false;
    const spellCard = this.state.spellCard;
    if (!spellCard) {
      return;
    }

    if (spellCard.phase === "spell_card") {
      this.moveTowardNearestEnemy(ctx);
      this.syncHealthFromSpellCard();
      return;
    }

    if (this.state.leapTicksRemaining <= 0) {
      this.state.vx = 0;
      this.state.vy = 0;
      if (this.state.ageTicks >= this.state.nextLeapAt) {
        this.beginLeap(ctx);
      }
    }

    if (this.state.leapTicksRemaining > 0) {
      if (this.state.leapTicksRemaining === 1) {
        this.state.x = this.state.leapTargetX;
        this.state.y = this.state.leapTargetY;
        this.state.vx = 0;
        this.state.vy = 0;
        this.state.leapTicksRemaining = 0;
        this.state.jumpedThisTick = true;
      } else {
        this.state.x = clamp(
          this.state.x + this.state.vx,
          WHITECAT_RADIUS,
          ctx.arenaBounds.width - WHITECAT_RADIUS,
        );
        this.state.y = clamp(
          this.state.y + this.state.vy,
          WHITECAT_RADIUS,
          ctx.arenaBounds.height - WHITECAT_RADIUS,
        );
        this.state.leapTicksRemaining -= 1;
      }
    }
    syncDefaultFamiliarMotion(this.state);
    this.syncHealthFromSpellCard();
  }

  fire(
    ctx: NeutralMobActionContext<
      BattleBulletSpawnParams,
      BattleLaserSpawnParams
    >,
  ): void {
    const spellCard = this.state.spellCard;
    if (!spellCard) {
      return;
    }
    if (spellCard.phase === "spell_card") {
      this.fireWheel(ctx);
      return;
    }
    if (!this.state.jumpedThisTick) {
      return;
    }
    const target =
      lockedEnemy(ctx, this.state) ??
      nearestEnemy(ctx, this.state.x, this.state.y);
    if (!target) {
      return;
    }
    const angle = Math.atan2(target.y - this.state.y, target.x - this.state.x);
    const spreadStep = 0.12;
    const center = (WHITECAT_SNIPE_BULLET_COUNT - 1) / 2;
    for (let index = 0; index < WHITECAT_SNIPE_BULLET_COUNT; index += 1) {
      spawnWhitecatBullet(ctx, {
        x: this.state.x,
        y: this.state.y,
        angle: angle + (index - center) * spreadStep,
        speedRank: "medium",
        damage: WHITECAT_SNIPE_DAMAGE,
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
    if (this.state.CurrentHealth <= 0 && !this.state.spellCard) {
      this.state.active = false;
    }
  }

  onProjectileHit(damage: number): "accepted" | "ignored" {
    if (!this.state.active || damage <= 0) {
      return "ignored";
    }
    this.state.damageTaken += damage;
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

  onDeath(): void {}

  private moveTowardNearestEnemy(
    ctx: NeutralMobActionContext<
      BattleBulletSpawnParams,
      BattleLaserSpawnParams
    >,
  ): void {
    const target =
      lockedEnemy(ctx, this.state) ??
      nearestEnemy(ctx, this.state.x, this.state.y);
    if (!target) {
      this.state.vx = 0;
      this.state.vy = 0;
      syncDefaultFamiliarMotion(this.state);
      return;
    }
    const dx = target.x - this.state.x;
    const dy = target.y - this.state.y;
    const distance = Math.hypot(dx, dy);
    if (distance <= 0.001) {
      this.state.vx = 0;
      this.state.vy = 0;
    } else {
      this.state.vx = (dx / distance) * WHITECAT_SPELL_MOVE_SPEED;
      this.state.vy = (dy / distance) * WHITECAT_SPELL_MOVE_SPEED;
      this.state.x = clamp(
        this.state.x + this.state.vx,
        WHITECAT_RADIUS,
        ctx.arenaBounds.width - WHITECAT_RADIUS,
      );
      this.state.y = clamp(
        this.state.y + this.state.vy,
        WHITECAT_RADIUS,
        ctx.arenaBounds.height - WHITECAT_RADIUS,
      );
    }
    syncDefaultFamiliarMotion(this.state);
  }

  private beginLeap(
    ctx: NeutralMobActionContext<
      BattleBulletSpawnParams,
      BattleLaserSpawnParams
    >,
  ): void {
    const angle = deterministicAngle(this.state.id, this.state.ageTicks);
    const targetX = clamp(
      this.state.x + Math.cos(angle) * WHITECAT_LEAP_DISTANCE,
      WHITECAT_RADIUS,
      ctx.arenaBounds.width - WHITECAT_RADIUS,
    );
    const targetY = clamp(
      this.state.y + Math.sin(angle) * WHITECAT_LEAP_DISTANCE,
      WHITECAT_RADIUS,
      ctx.arenaBounds.height - WHITECAT_RADIUS,
    );
    this.state.angle = angle;
    this.state.leapTargetX = targetX;
    this.state.leapTargetY = targetY;
    this.state.leapTicksRemaining = WHITECAT_LEAP_DURATION_TICKS;
    this.state.nextLeapAt =
      this.state.ageTicks + WHITECAT_LEAP_INTERVAL_TICKS;
    this.state.vx =
      (targetX - this.state.x) / WHITECAT_LEAP_DURATION_TICKS;
    this.state.vy =
      (targetY - this.state.y) / WHITECAT_LEAP_DURATION_TICKS;
  }

  private fireWheel(
    ctx: NeutralMobActionContext<
      BattleBulletSpawnParams,
      BattleLaserSpawnParams
    >,
  ): void {
    if (this.state.ageTicks % WHITECAT_WHEEL_INTERVAL_TICKS !== 0) {
      return;
    }
    const baseAngle = this.state.ageTicks * 0.09;
    for (let index = 0; index < WHITECAT_WHEEL_BULLET_COUNT; index += 1) {
      spawnWhitecatBullet(ctx, {
        x: this.state.x,
        y: this.state.y,
        angle: baseAngle + (FULL_CIRCLE * index) / WHITECAT_WHEEL_BULLET_COUNT,
        speedRank: "low",
        damage: WHITECAT_WHEEL_DAMAGE,
      });
    }
  }

  private syncHealthFromSpellCard(): void {
    if (!this.state.spellCard) {
      return;
    }
    this.state.MaxHealth = this.state.spellCard.maxHealth;
    this.state.CurrentHealth = this.state.spellCard.currentHealth;
  }
}

registerFamiliarSnapshotFactory((snapshot) => {
  if (snapshot.kind !== WHITECAT_FAMILIAR_KIND) {
    return undefined;
  }
  return WhitecatFamiliar.fromSnapshot(snapshot as WhitecatFamiliarState);
});

interface WhitecatLockedTarget {
  readonly key?: FamiliarMobState["key"] | "Neutral";
  readonly mobId?: number;
  readonly x: number;
  readonly y: number;
}

function nearestEnemyToAim(
  ctx: BattleCardContext,
): WhitecatLockedTarget | undefined {
  const aim = ctx.aim ?? { x: ctx.opponent.x, y: ctx.opponent.y };
  let best: WhitecatLockedTarget | undefined;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const target of ctx.enemyTargets ?? [
    {
      key: ctx.opponent.key,
      x: ctx.opponent.x,
      y: ctx.opponent.y,
    },
  ]) {
    const distance = (target.x - aim.x) ** 2 + (target.y - aim.y) ** 2;
    if (distance < bestDistance) {
      best = {
        key: whitecatTargetKey(target.key),
        mobId: target.mobId,
        x: target.x,
        y: target.y,
      };
      bestDistance = distance;
    }
  }
  return best;
}

function lockedEnemy(
  ctx: NeutralMobActionContext<BattleBulletSpawnParams, BattleLaserSpawnParams>,
  state: WhitecatFamiliarState,
): NeutralMobTargetState | undefined {
  if (
    state.lockedTargetMobId === undefined &&
    state.lockedTargetKey === undefined
  ) {
    return undefined;
  }
  return (ctx.enemyTargets ?? []).find((target) => {
    if (state.lockedTargetMobId !== undefined) {
      return target.mobId === state.lockedTargetMobId;
    }
    return target.key === state.lockedTargetKey;
  });
}

function nearestEnemy(
  ctx: NeutralMobActionContext<BattleBulletSpawnParams, BattleLaserSpawnParams>,
  x: number,
  y: number,
): NeutralMobTargetState | undefined {
  let best: NeutralMobTargetState | undefined;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const target of ctx.enemyTargets ?? [ctx.target]) {
    const distance = (target.x - x) ** 2 + (target.y - y) ** 2;
    if (distance < bestDistance) {
      best = target;
      bestDistance = distance;
    }
  }
  return best;
}

function spawnWhitecatBullet(
  ctx: NeutralMobActionContext<BattleBulletSpawnParams, BattleLaserSpawnParams>,
  params: {
    readonly x: number;
    readonly y: number;
    readonly angle: number;
    readonly speedRank: "low" | "medium";
    readonly damage: number;
  },
): void {
  ctx.spawnBullet({
    owner: ctx.owner,
    sourceCharacterId: undefined,
    textureKey: WHITECAT_BULLET_TEXTURE,
    kind: "orb",
    x: params.x,
    y: params.y,
    angle: params.angle,
    speedRank: params.speedRank,
    width: WHITECAT_BULLET_SIZE,
    height: WHITECAT_BULLET_SIZE,
    homingTicks: 0,
    damage: params.damage,
    spawnOffset: 0,
    couldClear: true,
  });
}

function deterministicAngle(id: number, ageTicks: number): number {
  const seed = (id * 1103515245 + ageTicks * 12345) >>> 0;
  return ((seed % 65536) / 65536) * FULL_CIRCLE;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function playerOwner(
  key: WhitecatFamiliarState["key"],
): Exclude<FamiliarMobState["key"], "Neutral"> {
  return key;
}

function whitecatTargetKey(
  key: string | undefined,
): WhitecatLockedTarget["key"] {
  if (key === "Player1" || key === "Player2" || key === "Neutral") {
    return key;
  }
  return undefined;
}
