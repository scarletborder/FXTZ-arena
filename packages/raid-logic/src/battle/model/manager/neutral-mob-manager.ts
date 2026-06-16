import type {
  NeutralMob,
  NeutralMobActionContext,
  CollaborateExtraState,
  NeutralMobState,
} from "@repo/types";
import { DEFAULT_ARENA_BOUNDS, type ArenaBounds } from "@repo/types";
import type { FighterKey, FighterState } from "@repo/content";
import type { NeutralMobSpawner, NeutralMobSpawnerState } from "@repo/content";

import type {
  BulletProjectileParams,
  LaserProjectileParams,
  ProjectileHitTarget,
} from "../projectile";

export type BattleNeutralMob = NeutralMob<
  NeutralMobState,
  BulletProjectileParams,
  LaserProjectileParams
>;

export class NeutralMobManager {
  readonly mobs: BattleNeutralMob[] = [];
  private nextNeutralMobId = 1;

  constructor(
    private readonly mobSpawner: NeutralMobSpawner | undefined,
    private readonly arenaBounds: ArenaBounds = DEFAULT_ARENA_BOUNDS,
  ) {}

  reset(): void {
    this.mobSpawner?.reset();
    this.mobs.length = 0;
    this.nextNeutralMobId = 1;
  }

  allocateNeutralMobId(params?: {
    readonly waveId: number;
    readonly waveMemberIndex: number;
  }): number {
    if (params) {
      const id = stableNeutralMobId(params.waveId, params.waveMemberIndex);
      this.nextNeutralMobId = Math.max(this.nextNeutralMobId, id + 1);
      return id;
    }
    return this.nextNeutralMobId++;
  }

  getNextNeutralMobId(): number {
    return this.nextNeutralMobId;
  }

  addNeutralMob(mob: BattleNeutralMob): void {
    if (this.mobs.some((existing) => existing.id === mob.id)) {
      throw new Error(`Duplicate neutral mob id: ${mob.id}`);
    }
    this.mobs.push(mob);
    this.nextNeutralMobId = Math.max(this.nextNeutralMobId, mob.id + 1);
    this.sortNeutralMobs();
  }

  states(): readonly NeutralMobState[] {
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
    readonly timeStopped: boolean;
    readonly createActionContext: () => NeutralMobActionContext<
      BulletProjectileParams,
      LaserProjectileParams
    >;
    readonly onSpecialMobDefeated?: (mob: NeutralMobState) => void;
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
      mob.step(params.createActionContext());
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
    readonly damage: number;
    readonly onKilled: (mob: NeutralMobState, source: FighterKey) => void;
  }): boolean {
    const mob = this.mobs.find(
      (candidate) => candidate.id === params.target.mobId,
    );
    if (!mob) {
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

  restoreSnapshots(snapshots: readonly NeutralMobState[]): void {
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
      } else if (this.mobSpawner) {
        const created = this.mobSpawner.createMobFromSnapshot(snapshot);
        if (created) {
          this.mobs.push(created);
        }
      }
    }
    this.nextNeutralMobId = Math.max(
      this.nextNeutralMobId,
      1 + Math.max(0, ...snapshots.map((mob) => mob.id)),
    );
    this.sortNeutralMobs();
  }

  restoreNextId(
    nextNeutralMobId: number,
    snapshots: readonly NeutralMobState[],
  ): void {
    this.nextNeutralMobId = Math.max(
      nextNeutralMobId,
      1 + Math.max(0, ...snapshots.map((mob) => mob.id)),
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

function stableNeutralMobId(waveId: number, waveMemberIndex: number): number {
  const normalizedWaveId = Math.max(0, Math.floor(waveId));
  const normalizedMemberIndex = Math.max(0, Math.floor(waveMemberIndex));
  return normalizedWaveId * 1000 + normalizedMemberIndex + 1;
}

function isSpecialSpellMob(state: NeutralMobState): boolean {
  return (
    !!state.spellCard && (state.class === "elite" || state.class === "boss")
  );
}
