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
import { secondsToTicks } from "../seconds-to-ticks";
import { registerFamiliarSnapshotFactory } from "../characters/familiar-snapshot";
import {
  createDefaultFamiliarState,
  DEFAULT_FAMILIAR_TEXTURE_KEY,
  syncDefaultFamiliarMotion,
  type DefaultFamiliarState,
} from "../characters/default-familiar";
import { Vanilla } from "../decorators";
import type { AbilityCardDefinition } from "./types";
import { BattleAbilityCard, type BattleCardContext } from "./base";

export const DOLL_FAMILIAR_KIND = "doll_familiar";
export const DOLL_HEALTH = 300;
export const DOLL_PHYSICAL_DAMAGE = 1;
export const DOLL_BULLET_TEXTURE = "bullet_type_10_offset_11";
export const DOLL_BULLET_SIZE = 12;
export const DOLL_VOLLEY_INTERVAL_TICKS = secondsToTicks(1.2);
export const DOLL_RETURN_DISTANCE = 64;

const DOLL_RADIUS = 18;
const DOLL_LAUNCH_SPEED = bulletSpeedRankToPixelsPerTick("high");
const DOLL_RETURN_SPEED = bulletSpeedRankToPixelsPerTick("medium");
const DOLL_BULLET_DAMAGE = 8;
const CARD_COOLDOWN_TICKS = secondsToTicks(15);
const CARD_ICON = "assets/ability-cards/whitecat/icon.png";
const CARD_ID = "doll" satisfies AbilityCardDefinition["id"];

export class DollBattleCard extends BattleAbilityCard {
  readonly id = CARD_ID;
  readonly name = "content.ability_cards.doll.name";
  readonly cost = 2;
  readonly kind = "active" as AbilityCardDefinition["kind"];
  readonly useLimit: AbilityCardDefinition["useLimit"] = "infinite";
  readonly cooldownTicks = CARD_COOLDOWN_TICKS;
  readonly description = "content.ability_cards.doll.description";
  readonly gallery: AbilityCardDefinition["gallery"] = {
    iconAsset: CARD_ICON,
  };

  onUse(ctx: BattleCardContext): void {
    if (!ctx.spawnMob || !ctx.allocateMobId || ctx.self.key === "Neutral") {
      return;
    }
    for (const mob of ctx.mobs ?? []) {
      if (
        mob.state.key === ctx.self.key &&
        mob.state.kind === DOLL_FAMILIAR_KIND
      ) {
        mob.state.active = false;
      }
    }
    const target = ctx.aim ?? { x: ctx.opponent.x, y: ctx.opponent.y };
    ctx.spawnMob(
      new DollFamiliar(
        ctx.allocateMobId(),
        ctx.self.key,
        ctx.self.x,
        ctx.self.y,
        target.x,
        target.y,
      ),
    );
  }
}

Vanilla.registerCard(CARD_ID)(DollBattleCard);

export interface DollFamiliarState
  extends DefaultFamiliarState<typeof DOLL_FAMILIAR_KIND> {
  readonly sourceAbilityCardId: typeof CARD_ID;
  phase: "launch" | "idle" | "return";
  launchTargetX: number;
  launchTargetY: number;
  nextVolleyAt: number;
  lastOwnerReloadRemaining: number;
}

class DollFamiliar extends FamiliarMob<
  DollFamiliarState,
  BattleBulletSpawnParams,
  BattleLaserSpawnParams
> {
  readonly state: DollFamiliarState;

  constructor(
    id: number,
    owner: Exclude<FamiliarMobState["key"], "Neutral">,
    x: number,
    y: number,
    targetX: number,
    targetY: number,
  ) {
    super();
    this.state = {
      ...createDefaultFamiliarState({
        id,
        key: owner,
        kind: DOLL_FAMILIAR_KIND,
        x,
        y,
        health: DOLL_HEALTH,
        radius: DOLL_RADIUS,
        physicalAttack: true,
        physicalAttackDamage: DOLL_PHYSICAL_DAMAGE,
      }),
      sourceAbilityCardId: CARD_ID,
      textureKey: DEFAULT_FAMILIAR_TEXTURE_KEY,
      displayName: "人偶使魔",
      phase: "launch",
      launchTargetX: targetX,
      launchTargetY: targetY,
      nextVolleyAt: Number.POSITIVE_INFINITY,
      lastOwnerReloadRemaining: 0,
    };
  }

  static fromSnapshot(snapshot: DollFamiliarState): DollFamiliar {
    const mob = new DollFamiliar(
      snapshot.id,
      snapshot.key,
      snapshot.x,
      snapshot.y,
      snapshot.launchTargetX,
      snapshot.launchTargetY,
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
    const owner = ownerTarget(ctx, this.state.key);
    const ownerReloadRemaining = owner?.reloadRemaining ?? 0;
    if (
      this.state.phase === "idle" &&
      this.state.lastOwnerReloadRemaining <= 0 &&
      ownerReloadRemaining > 0
    ) {
      this.state.phase = "return";
      this.state.nextVolleyAt =
        this.state.ageTicks + DOLL_VOLLEY_INTERVAL_TICKS;
    }
    this.state.lastOwnerReloadRemaining = ownerReloadRemaining;

    if (this.state.phase === "launch") {
      this.moveTowardPoint(
        ctx,
        this.state.launchTargetX,
        this.state.launchTargetY,
        DOLL_LAUNCH_SPEED,
        0,
      );
      return;
    }

    if (this.state.phase === "return" && owner) {
      this.moveTowardPoint(
        ctx,
        owner.x,
        owner.y,
        DOLL_RETURN_SPEED,
        DOLL_RETURN_DISTANCE,
      );
      return;
    }

    this.state.vx = 0;
    this.state.vy = 0;
    syncDefaultFamiliarMotion(this.state);
  }

  fire(
    ctx: NeutralMobActionContext<
      BattleBulletSpawnParams,
      BattleLaserSpawnParams
    >,
  ): void {
    if (
      this.state.phase !== "return" ||
      this.state.ageTicks < this.state.nextVolleyAt
    ) {
      return;
    }
    this.state.nextVolleyAt += DOLL_VOLLEY_INTERVAL_TICKS;
    for (const angle of [0, Math.PI / 2, Math.PI, (Math.PI * 3) / 2]) {
      ctx.spawnBullet({
        owner: ctx.owner,
        sourceCharacterId: undefined,
        textureKey: DOLL_BULLET_TEXTURE,
        kind: "orb",
        x: this.state.x,
        y: this.state.y,
        angle,
        speedRank: "low",
        width: DOLL_BULLET_SIZE,
        height: DOLL_BULLET_SIZE,
        homingTicks: 0,
        damage: DOLL_BULLET_DAMAGE,
        spawnOffset: 0,
        couldClear: true,
      });
    }
  }

  switchForm(): void { }

  die(): void {
    if (this.state.CurrentHealth <= 0) {
      this.state.active = false;
    }
  }

  onProjectileHit(damage: number): "accepted" | "ignored" {
    if (!this.state.active || damage <= 0) {
      return "ignored";
    }
    this.state.damageTaken += damage;
    this.state.CurrentHealth = Math.max(0, this.state.CurrentHealth - damage);
    if (this.state.CurrentHealth <= 0) {
      this.state.active = false;
    }
    return "accepted";
  }

  onDeath(): void { }

  private moveTowardPoint(
    ctx: NeutralMobActionContext<
      BattleBulletSpawnParams,
      BattleLaserSpawnParams
    >,
    targetX: number,
    targetY: number,
    speed: number,
    stopDistance: number,
  ): void {
    const dx = targetX - this.state.x;
    const dy = targetY - this.state.y;
    const distance = Math.hypot(dx, dy);
    if (this.state.phase == "return" && distance <= stopDistance) {
      // 回收
      this.state.active = false;
      return;
    }
    if (distance <= speed) {
      if (stopDistance <= 0) {
        this.state.x = clamp(
          targetX,
          DOLL_RADIUS,
          ctx.arenaBounds.width - DOLL_RADIUS,
        );
        this.state.y = clamp(
          targetY,
          DOLL_RADIUS,
          ctx.arenaBounds.height - DOLL_RADIUS,
        );
        this.state.phase = "idle";
        this.state.nextVolleyAt = Number.POSITIVE_INFINITY;
      }
      this.state.vx = 0;
      this.state.vy = 0;
      syncDefaultFamiliarMotion(this.state);
      return;
    }
    this.state.vx = (dx / distance) * speed;
    this.state.vy = (dy / distance) * speed;
    this.state.x = clamp(
      this.state.x + this.state.vx,
      DOLL_RADIUS,
      ctx.arenaBounds.width - DOLL_RADIUS,
    );
    this.state.y = clamp(
      this.state.y + this.state.vy,
      DOLL_RADIUS,
      ctx.arenaBounds.height - DOLL_RADIUS,
    );
    syncDefaultFamiliarMotion(this.state);
  }
}

registerFamiliarSnapshotFactory((snapshot) => {
  if (snapshot.kind !== DOLL_FAMILIAR_KIND) {
    return undefined;
  }
  return DollFamiliar.fromSnapshot(snapshot as DollFamiliarState);
});

function ownerTarget(
  ctx: NeutralMobActionContext<BattleBulletSpawnParams, BattleLaserSpawnParams>,
  owner: FamiliarMobState["key"],
): NeutralMobTargetState | undefined {
  return owner === "Player1" ? ctx.player : ctx.target;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
