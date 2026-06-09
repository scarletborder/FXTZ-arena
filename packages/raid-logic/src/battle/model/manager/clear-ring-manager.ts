import type { FighterKey, FighterState, ProjectileState } from "@repo/content";

import type { BattleRules } from "../battle-rules";
import {
  createClearRingState,
  stepClearRings,
  type ClearRingState,
} from "../entities/clear-ring";
import {
  restoreClearRingSnapshot,
  type ClearRingSnapshot,
} from "../snapshot";

export class ClearRingManager {
  readonly clearRings: ClearRingState[] = [];
  private nextClearRingId = 1;

  reset(): void {
    this.clearRings.length = 0;
    this.nextClearRingId = 1;
  }

  getNextClearRingId(): number {
    return this.nextClearRingId;
  }

  restore(
    snapshots: readonly ClearRingSnapshot[],
    frame: number,
    nextClearRingId: number,
  ): void {
    this.clearRings.splice(
      0,
      this.clearRings.length,
      ...snapshots.map((ring) => restoreClearRingSnapshot(ring, frame)),
    );
    this.nextClearRingId = Math.max(
      nextClearRingId,
      1 + Math.max(0, ...snapshots.map((ring) => ring.id)),
    );
  }

  spawn(params: {
    readonly owner: FighterKey;
    readonly x: number;
    readonly y: number;
    readonly radius: number;
    readonly frame: number;
    readonly duration: number;
    readonly followsOwner?: boolean;
  }): ClearRingState {
    const ring = createClearRingState({
      id: this.nextClearRingId++,
      owner: params.owner,
      x: params.x,
      y: params.y,
      radius: params.radius,
      frame: params.frame,
      duration: params.duration,
      followsOwner: params.followsOwner,
    });
    this.clearRings.push(ring);
    return ring;
  }

  step(params: {
    readonly frame: number;
    readonly projectiles: ProjectileState[];
    readonly fighters: Readonly<Record<FighterKey, FighterState | undefined>>;
    readonly rules?: BattleRules;
  }): void {
    stepClearRings({
      frame: params.frame,
      clearRings: this.clearRings,
      projectiles: params.projectiles,
      fighters: params.fighters,
      rules: params.rules,
    });
  }
}
