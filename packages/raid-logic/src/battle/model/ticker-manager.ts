import type { ProjectileState } from "@repo/types";
import type {
  ProjectileTimerSnapshot,
  TickerManagerSnapshot,
} from "@repo/types";

export type {
  ProjectileTimerSnapshot,
  TickerManagerSnapshot,
} from "@repo/types";

export class FrameTimer {
  readonly id: number;
  targetFrame: number;
  readonly group: string;

  constructor(options: {
    readonly id: number;
    readonly targetFrame: number;
    readonly group: string;
  }) {
    this.id = options.id;
    this.targetFrame = options.targetFrame;
    this.group = options.group;
  }

  getLeftFrames(currentFrame: number): number {
    return this.targetFrame - currentFrame;
  }
}

type ProjectileTimerKey =
  | "visibleFrom"
  | "expireAt"
  | "damageFrom"
  | "damageUntil"
  | "homingStartAt"
  | "homingUntil"
  | "pausedUntil"
  | "retargetAt";

const PROJECTILE_TIMERS: readonly ProjectileTimerKey[] = [
  "visibleFrom",
  "expireAt",
  "damageFrom",
  "damageUntil",
  "homingStartAt",
  "homingUntil",
  "pausedUntil",
  "retargetAt",
];

const PROJECTILE_PAUSE_DEPENDENT_TIMERS: readonly ProjectileTimerKey[] = [
  "visibleFrom",
  "expireAt",
  "damageFrom",
  "damageUntil",
  "homingStartAt",
  "homingUntil",
  "retargetAt",
];

export class TickerManager {
  currentFrame = 0;
  private readonly timers = new Map<number, FrameTimer>();
  private nextTimerId = 1;

  setCurrentFrame(frame: number): void {
    this.currentFrame = frame;
  }

  register(targetFrame: number, group = "default"): FrameTimer {
    const timer = new FrameTimer({
      id: this.nextTimerId++,
      targetFrame,
      group,
    });
    this.timers.set(timer.id, timer);
    return timer;
  }

  unregister(timer: FrameTimer): void {
    this.timers.delete(timer.id);
  }

  removeGroup(group: string): void {
    for (const [id, timer] of Array.from(this.timers)) {
      if (timer.group === group) {
        this.timers.delete(id);
      }
    }
  }

  getRemainingTicks(group: string): number {
    let remaining = 0;
    for (const timer of Array.from(this.timers.values())) {
      if (timer.group === group && timer.targetFrame > this.currentFrame) {
        remaining = Math.max(remaining, timer.targetFrame - this.currentFrame);
      }
    }
    return remaining;
  }

  pauseGroup(group: string, ticks: number): void {
    if (ticks <= 0) {
      return;
    }
    for (const timer of Array.from(this.timers.values())) {
      if (timer.group === group && timer.targetFrame > this.currentFrame) {
        timer.targetFrame += ticks;
      }
    }
  }

  resumeGroup(group: string, ticks: number): void {
    if (ticks <= 0) {
      return;
    }
    for (const timer of Array.from(this.timers.values())) {
      if (timer.group === group && timer.targetFrame > this.currentFrame) {
        timer.targetFrame = Math.max(
          this.currentFrame,
          timer.targetFrame - ticks,
        );
      }
    }
  }

  pauseProjectileTimeline(projectile: ProjectileState, ticks: number): void {
    if (ticks <= 0) {
      return;
    }
    projectile.pausedUntil =
      Math.max(projectile.pausedUntil, this.currentFrame) + ticks;
    for (const key of PROJECTILE_PAUSE_DEPENDENT_TIMERS) {
      this.delayProjectileTimer(projectile, key, ticks);
    }
  }

  resumeProjectileTimeline(projectile: ProjectileState, ticks: number): void {
    if (ticks <= 0 || projectile.pausedUntil <= this.currentFrame) {
      return;
    }
    projectile.pausedUntil = Math.max(
      this.currentFrame,
      projectile.pausedUntil - ticks,
    );
    for (const key of PROJECTILE_PAUSE_DEPENDENT_TIMERS) {
      this.resumeProjectileTimer(projectile, key, ticks);
    }
  }

  serializeProjectileTimers(
    projectile: ProjectileState,
  ): ProjectileTimerSnapshot {
    return {
      visibleIn: projectile.visibleFrom - this.currentFrame,
      expireIn:
        projectile.expireAt === undefined
          ? undefined
          : projectile.expireAt - this.currentFrame,
      damageFromIn:
        projectile.damageFrom === undefined
          ? undefined
          : projectile.damageFrom - this.currentFrame,
      damageUntilIn:
        projectile.damageUntil === undefined
          ? undefined
          : projectile.damageUntil - this.currentFrame,
      homingStartIn: projectile.homingStartAt - this.currentFrame,
      homingRemaining: projectile.homingUntil - this.currentFrame,
      pausedRemaining: projectile.pausedUntil - this.currentFrame,
      retargetIn:
        projectile.retargetAt === undefined
          ? undefined
          : projectile.retargetAt - this.currentFrame,
    };
  }

  restoreProjectileTimers(
    snapshot: ProjectileTimerSnapshot,
  ): Pick<ProjectileState, ProjectileTimerKey> {
    return {
      visibleFrom: this.currentFrame + snapshot.visibleIn,
      expireAt:
        snapshot.expireIn === undefined
          ? undefined
          : this.currentFrame + snapshot.expireIn,
      damageFrom:
        snapshot.damageFromIn === undefined
          ? undefined
          : this.currentFrame + snapshot.damageFromIn,
      damageUntil:
        snapshot.damageUntilIn === undefined
          ? undefined
          : this.currentFrame + snapshot.damageUntilIn,
      homingStartAt: this.currentFrame + snapshot.homingStartIn,
      homingUntil: this.currentFrame + snapshot.homingRemaining,
      pausedUntil: this.currentFrame + snapshot.pausedRemaining,
      retargetAt:
        snapshot.retargetIn === undefined
          ? undefined
          : this.currentFrame + snapshot.retargetIn,
    };
  }

  snapshot(): TickerManagerSnapshot {
    return {
      currentFrame: this.currentFrame,
      nextTimerId: this.nextTimerId,
      timers: Array.from(this.timers.values())
        .sort((left, right) => left.id - right.id)
        .map((timer) => ({
          id: timer.id,
          targetIn: timer.targetFrame - this.currentFrame,
          group: timer.group,
        })),
    };
  }

  restore(snapshot: TickerManagerSnapshot): void {
    this.currentFrame = snapshot.currentFrame;
    this.nextTimerId = snapshot.nextTimerId;
    this.timers.clear();
    for (const timer of snapshot.timers) {
      this.timers.set(
        timer.id,
        new FrameTimer({
          id: timer.id,
          targetFrame: this.currentFrame + timer.targetIn,
          group: timer.group,
        }),
      );
    }
  }

  reset(): void {
    this.currentFrame = 0;
    this.nextTimerId = 1;
    this.timers.clear();
  }

  private delayProjectileTimer(
    projectile: ProjectileState,
    key: ProjectileTimerKey,
    ticks: number,
  ): void {
    const value = projectile[key];
    if (value !== undefined && value > this.currentFrame) {
      projectile[key] = value + ticks;
    }
  }

  private resumeProjectileTimer(
    projectile: ProjectileState,
    key: ProjectileTimerKey,
    ticks: number,
  ): void {
    const value = projectile[key];
    if (value !== undefined && value > this.currentFrame) {
      projectile[key] = Math.max(this.currentFrame, value - ticks);
    }
  }
}

export function projectileTimerKeys(): readonly ProjectileTimerKey[] {
  return PROJECTILE_TIMERS;
}
