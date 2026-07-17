import type {
  Mob,
  MobState,
  NeutralMobActionContext,
  CollaborateExtraState,
} from "@repo/types";
import {
  DEFAULT_ARENA_BOUNDS,
  PLAYER_CORE_RADIUS,
  type ArenaBounds,
} from "@repo/types";
import type { FighterKey, FighterState, ProjectileState } from "@repo/types";
import type { NeutralMobSpawner, NeutralMobSpawnerState } from "@repo/content";
import { createFamiliarFromSnapshot } from "@repo/content";
import {
  BACKDOOR_FAMILIAR_KIND,
  UFO_HELPER_FAMILIAR_KIND,
  clearsOrdinaryProjectileByDefensiveFamiliar,
} from "@repo/content";
import type { BattleRules } from "../battle-rules";

import type {
  BulletProjectileParams,
  LaserProjectileParams,
  ProjectileHitTarget,
} from "../projectile";

export type BattleNeutralMob = Mob<
  MobState,
  BulletProjectileParams,
  LaserProjectileParams
>;

export class NeutralMobManager {
  readonly mobs: BattleNeutralMob[] = [];
  private nextDynamicNeutralMobId = DYNAMIC_NEUTRAL_MOB_ID_START;

  constructor(
    private readonly mobSpawner: NeutralMobSpawner | undefined,
    private readonly arenaBounds: ArenaBounds = DEFAULT_ARENA_BOUNDS,
  ) {}

  reset(): void {
    this.mobSpawner?.reset();
    this.mobs.length = 0;
    this.nextDynamicNeutralMobId = DYNAMIC_NEUTRAL_MOB_ID_START;
  }

  allocateNeutralMobId(params?: {
    readonly waveId: number;
    readonly waveMemberIndex: number;
  }): number {
    if (params) {
      return stableNeutralMobId(params.waveId, params.waveMemberIndex);
    }
    return this.nextDynamicNeutralMobId++;
  }

  getNextNeutralMobId(): number {
    return this.nextDynamicNeutralMobId;
  }

  addNeutralMob(mob: BattleNeutralMob): void {
    if (this.mobs.some((existing) => existing.id === mob.id)) {
      throw new Error(`Duplicate neutral mob id: ${mob.id}`);
    }
    this.mobs.push(mob);
    this.nextDynamicNeutralMobId = Math.max(
      this.nextDynamicNeutralMobId,
      nextDynamicMobIdAfter(this.mobs),
    );
    this.sortNeutralMobs();
  }

  states(): readonly MobState[] {
    return this.mobs.map((mob) => mob.snapshot());
  }

  hitTargets(): readonly ProjectileHitTarget[] {
    return this.mobs
      .filter((mob) => mob.state.active)
      .sort((left, right) => left.id - right.id)
      .map((mob) => ({
        key: mob.state.key,
        x: mob.state.x,
        y: mob.state.y,
        hitRadius: mob.state.hitRadius,
        hitWidth: mob.state.hitWidth,
        hitHeight: mob.state.hitHeight,
        mobId: mob.id,
      }));
  }

  mobSpawnerState(): NeutralMobSpawnerState | undefined {
    return this.mobSpawner?.snapshot();
  }

  stepSpawner(params: {
    readonly frame: number;
    readonly arenaBounds?: ArenaBounds;
    readonly player: FighterState;
    readonly target: FighterState;
    readonly timeStopped: boolean;
    readonly collaborateExtra?: CollaborateExtraState;
    updateCollaborateExtra(
      updater: (state: CollaborateExtraState) => CollaborateExtraState,
    ): void;
    beginCollaborateTransition(
      target: "elite" | "boss" | "shop",
      type: "auto" | "manual",
    ): void;
  }): void {
    if (!this.mobSpawner || params.timeStopped) return;
    const context: Parameters<NeutralMobSpawner["step"]>[0] & {
      readonly arenaBounds: ArenaBounds;
    } = {
      frame: params.frame,
      arenaBounds: params.arenaBounds ?? this.arenaBounds,
      player: params.player,
      target: params.target,
      neutralMobs: this.mobs,
      collaborateExtra: params.collaborateExtra,
      allocateMobId: (idParams) => this.allocateNeutralMobId(idParams),
      spawnMob: (mob) => this.addNeutralMob(mob),
      updateCollaborateExtra: params.updateCollaborateExtra,
      beginCollaborateTransition: params.beginCollaborateTransition,
    };
    this.mobSpawner.step(context);
  }

  stepMobs(params: {
    readonly frame: number;
    readonly timeStopped: boolean;
    readonly player: FighterState;
    readonly target: FighterState;
    readonly rules: BattleRules;
    readonly createActionContext: (
      mob: BattleNeutralMob,
    ) => NeutralMobActionContext<BulletProjectileParams, LaserProjectileParams>;
    readonly onSpecialMobDefeated?: (mob: MobState) => void;
    readonly onPhysicalHit?: (params: {
      readonly mob: MobState;
      readonly victim: FighterState;
      readonly damage: number;
    }) => void;
    readonly onPhysicalMobKilled?: (mob: MobState, source: FighterKey) => void;
  }): void {
    this.sortNeutralMobs();
    if (params.timeStopped) {
      for (const mob of this.mobs) {
        mob.state.previousX = mob.state.x;
        mob.state.previousY = mob.state.y;
      }
      return;
    }
    for (const mob of this.mobs) {
      const wasActive = mob.state.active;
      mob.step(params.createActionContext(mob));
      if (mob.state.active && mob.state.physicalAttack) {
        const damage = mob.state.physicalAttackDamage ?? 1;
        for (const fighter of [params.player, params.target]) {
          if (
            canMobPhysicallyHit(mob.state, fighter, params.rules) &&
            circleIntersectsMob(
              fighter.x,
              fighter.y,
              fighterHitRadius(fighter),
              mob.state,
            )
          ) {
            markPhysicalContact(mob.state, params.frame);
            params.onPhysicalHit?.({ mob: mob.state, victim: fighter, damage });
          }
        }
        for (const target of this.mobs) {
          if (
            target.id !== mob.id &&
            target.state.active &&
            canMobPhysicallyDamageMob(mob.state, target.state, params.rules) &&
            mobsIntersect(mob.state, target.state)
          ) {
            const targetWasActive = target.state.active;
            const result = target.onProjectileHit(damage);
            if (result === "accepted") {
              markPhysicalContact(mob.state, params.frame);
            }
            if (
              result === "accepted" &&
              targetWasActive &&
              !target.state.active
            ) {
              target.onDeath(mob.state.key);
              params.onPhysicalMobKilled?.(target.state, mob.state.key);
              target.onDeathEffect();
            }
          }
        }
      }
      if (wasActive && !mob.state.active) {
        mob.onDeath(null);
        if (isSpecialSpellMob(mob.state)) {
          params.onSpecialMobDefeated?.(mob.state);
        }
        mob.onDeathEffect();
      }
    }
    this.removeInactive();
  }

  handleProjectileHit(params: {
    readonly target: ProjectileHitTarget;
    readonly owner: FighterKey;
    readonly projectile: ProjectileState;
    readonly damage: number;
    readonly onKilled: (mob: MobState, source: FighterKey) => void;
  }): boolean {
    const mob = this.mobs.find(
      (candidate) => candidate.id === params.target.mobId,
    );
    if (!mob) {
      return false;
    }
    if (
      (mob.state.kind === BACKDOOR_FAMILIAR_KIND ||
        mob.state.kind === UFO_HELPER_FAMILIAR_KIND) &&
      !clearsOrdinaryProjectileByDefensiveFamiliar({
        familiarKind: mob.state.kind,
        projectileKind: params.projectile.kind,
        owner: params.owner,
        targetOwner: mob.state.key,
        projectileDamage: params.projectile.damage,
        projectileVisible: true,
      })
    ) {
      return false;
    }
    const wasActive = mob.state.active;
    const result = mob.onProjectileHit(params.damage);
    if (result === "ignored") {
      return false;
    }
    if (wasActive && !mob.state.active) {
      mob.onDeath(params.owner);
      params.onKilled(mob.state, params.owner);
      mob.onDeathEffect();
    }
    return true;
  }

  removeInactive(): void {
    this.mobs.splice(
      0,
      this.mobs.length,
      ...this.mobs.filter((mob) => mob.state.active),
    );
  }

  clearActiveMobs(): void {
    this.mobs.length = 0;
  }

  restoreSnapshots(snapshots: readonly MobState[]): void {
    const ids = new Set(snapshots.map((snapshot) => snapshot.id));
    this.mobs.splice(
      0,
      this.mobs.length,
      ...this.mobs.filter((mob) => ids.has(mob.id)),
    );
    for (const snapshot of snapshots) {
      const existing = this.mobs.find(
        (candidate) => candidate.id === snapshot.id,
      );
      if (existing) {
        existing.restore(snapshot);
      } else {
        const created =
          this.mobSpawner?.createMobFromSnapshot(snapshot) ??
          createFamiliarFromSnapshot(snapshot);
        if (created) {
          this.mobs.push(created);
        }
      }
    }
    this.nextDynamicNeutralMobId = Math.max(
      this.nextDynamicNeutralMobId,
      nextDynamicMobIdAfter(snapshots),
    );
    this.sortNeutralMobs();
  }

  restoreNextId(
    nextNeutralMobId: number,
    snapshots: readonly MobState[],
  ): void {
    this.nextDynamicNeutralMobId = Math.max(
      nextNeutralMobId,
      DYNAMIC_NEUTRAL_MOB_ID_START,
      nextDynamicMobIdAfter(snapshots),
    );
  }

  restoreSpawner(snapshot: NeutralMobSpawnerState | undefined): void {
    if (snapshot) {
      this.mobSpawner?.restore(snapshot);
    }
  }

  private sortNeutralMobs(): void {
    this.mobs.sort((left, right) => left.id - right.id);
  }
}

const DYNAMIC_NEUTRAL_MOB_ID_START = 1_000_000_000;

function stableNeutralMobId(waveId: number, waveMemberIndex: number): number {
  const normalizedWaveId = Math.max(0, Math.floor(waveId));
  const normalizedMemberIndex = Math.max(0, Math.floor(waveMemberIndex));
  return normalizedWaveId * 1000 + normalizedMemberIndex + 1;
}

function nextDynamicMobIdAfter(
  mobs: readonly { readonly id: number }[],
): number {
  return (
    1 +
    Math.max(
      DYNAMIC_NEUTRAL_MOB_ID_START - 1,
      ...mobs
        .map((mob) => mob.id)
        .filter((id) => id >= DYNAMIC_NEUTRAL_MOB_ID_START),
    )
  );
}

function isSpecialSpellMob(state: MobState): boolean {
  return (
    !!state.spellCard && (state.class === "elite" || state.class === "boss")
  );
}

function canMobPhysicallyHit(
  mob: MobState,
  fighter: FighterState,
  rules: BattleRules,
): boolean {
  if (fighter.deadUntil > 0) {
    return false;
  }
  return rules.canProjectileDamageTarget(mob.key, fighter.key);
}

function canMobPhysicallyDamageMob(
  attacker: MobState,
  target: MobState,
  rules: BattleRules,
): boolean {
  return rules.canProjectileDamageTarget(attacker.key, target.key);
}

function fighterHitRadius(fighter: FighterState): number {
  return PLAYER_CORE_RADIUS * fighter.hitCircleRadiusMultiplier;
}

function circleIntersectsMob(
  x: number,
  y: number,
  radius: number,
  mob: MobState,
): boolean {
  if (mob.hitWidth !== undefined && mob.hitHeight !== undefined) {
    const halfWidth = mob.hitWidth / 2;
    const halfHeight = mob.hitHeight / 2;
    const closestX = Math.max(
      mob.x - halfWidth,
      Math.min(x, mob.x + halfWidth),
    );
    const closestY = Math.max(
      mob.y - halfHeight,
      Math.min(y, mob.y + halfHeight),
    );
    return (x - closestX) ** 2 + (y - closestY) ** 2 <= radius ** 2;
  }
  return (mob.x - x) ** 2 + (mob.y - y) ** 2 <= (mob.hitRadius + radius) ** 2;
}

function mobsIntersect(left: MobState, right: MobState): boolean {
  if (left.hitWidth !== undefined && left.hitHeight !== undefined) {
    return circleIntersectsMob(right.x, right.y, mobRadius(right), left);
  }
  return circleIntersectsMob(left.x, left.y, mobRadius(left), right);
}

function mobRadius(mob: MobState): number {
  if (mob.hitWidth !== undefined && mob.hitHeight !== undefined) {
    return Math.max(mob.hitWidth, mob.hitHeight) / 2;
  }
  return mob.hitRadius;
}

function markPhysicalContact(mob: MobState, frame: number): void {
  mob.rollStartedAt = frame;
  mob.rollUntil = Math.max(mob.rollUntil ?? 0, frame + 20);
}
