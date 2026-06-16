import { fp } from "@shaisrc/fixed-point";

import type { FighterState, PointState } from "@repo/content";
import type { NeutralMobState } from "@repo/types";
import { DEFAULT_ARENA_BOUNDS, type ArenaBounds } from "@repo/types";
import { fpHypotFp } from "@repo/content";
import { POINT_COUNT_MAX } from "../../constants";
import {
  createMoneyState,
  createPointState,
  createPowerState,
  POINT_COLLECT_TICKS,
  pointIsOutsideArena,
  pointVelocityFromFrame,
} from "../points";

export interface PointCollector {
  readonly state: FighterState;
  getPointCollectRadius(): number;
}

export interface PointCollectionAward {
  readonly collectorKey: FighterState["key"];
  readonly point: PointState;
}

interface RewardDropState {
  readonly size: "small" | "medium" | "large";
  readonly count?: number;
}

type NeutralMobStateWithRewardDrops = NeutralMobState & {
  readonly pointRewardDrops?: readonly RewardDropState[];
  readonly moneyRewardDrops?: readonly RewardDropState[];
  readonly powerRewardDrops?: readonly RewardDropState[];
};

export class PointManager {
  readonly points: PointState[] = [];
  private nextPointId = 1;

  constructor(
    private readonly arenaBounds: ArenaBounds = DEFAULT_ARENA_BOUNDS,
    private readonly onAward?: (award: PointCollectionAward) => void,
  ) {}

  reset(): void {
    this.points.length = 0;
    this.nextPointId = 1;
  }

  allocatePointId(): number {
    return this.nextPointId++;
  }

  getNextPointId(): number {
    return this.nextPointId;
  }

  addPoint(point: PointState): void {
    if (this.points.some((existing) => existing.id === point.id)) {
      throw new Error(`Duplicate point id: ${point.id}`);
    }
    this.points.push(point);
    this.nextPointId = Math.max(this.nextPointId, point.id + 1);
    this.sortPoints();
  }

  pointStates(): readonly PointState[] {
    return this.points;
  }

  setPointCount(fighter: FighterState, pointCount: number): void {
    fighter.pointCount = clampPointCount(pointCount);
  }

  restore(points: readonly PointState[], nextPointId: number): void {
    this.points.splice(
      0,
      this.points.length,
      ...points.map((point) => ({ ...point })),
    );
    this.nextPointId = Math.max(
      nextPointId,
      1 + Math.max(0, ...points.map((point) => point.id)),
    );
  }

  step(params: {
    readonly collectors: readonly PointCollector[];
    readonly timeStopped: boolean;
  }): void {
    this.sortPoints();
    for (const point of this.points) {
      point.previousX = point.x;
      point.previousY = point.y;
      if (point.collectingBy) {
        point.collectTicksRemaining -= 1;
        if (point.collectTicksRemaining <= 0) {
          this.awardPoint(point, params.collectors);
          point.active = false;
        }
        continue;
      }
      if (params.timeStopped) {
        continue;
      }
      point.x = fp.toFloat(
        fp.add(fp.fromFloat(point.x), fp.fromFloat(point.vx)),
      );
      point.y = fp.toFloat(
        fp.add(fp.fromFloat(point.y), fp.fromFloat(point.vy)),
      );
      if (pointIsOutsideArena(point, this.arenaBounds)) {
        point.active = false;
        continue;
      }
      this.tryCollectPoint(point, params.collectors);
    }
    this.points.splice(
      0,
      this.points.length,
      ...this.points.filter((point) => point.active),
    );
  }

  dropPointFromMob(frame: number, mob: NeutralMobState): void {
    const rewardMob = mob as NeutralMobStateWithRewardDrops;
    let dropIndex = 0;
    for (const drop of rewardDrops(rewardMob.pointRewardDrops, mob.pointRewardSize)) {
      const velocity = pointVelocityFromFrame(
        frame,
        "low",
        dropSeed(mob.id, dropIndex++),
      );
      this.addPoint(
        createPointState({
          id: this.allocatePointId(),
          x: mob.x,
          y: mob.y,
          rewardSize: drop.size,
          vx: velocity.vx,
          vy: velocity.vy,
        }),
      );
    }
    for (const drop of rewardDrops(rewardMob.moneyRewardDrops, mob.moneyRewardSize)) {
      const moneyVelocity = pointVelocityFromFrame(
        frame,
        "low",
        dropSeed(mob.id, dropIndex++),
      );
      this.addPoint(
        createMoneyState({
          id: this.allocatePointId(),
          x: mob.x,
          y: mob.y,
          rewardSize: drop.size,
          vx: moneyVelocity.vx,
          vy: moneyVelocity.vy,
        }),
      );
    }
    for (const drop of rewardDrops(rewardMob.powerRewardDrops, mob.powerRewardSize)) {
      const powerVelocity = pointVelocityFromFrame(
        frame,
        "low",
        dropSeed(mob.id, dropIndex++),
      );
      this.addPoint(
        createPowerState({
          id: this.allocatePointId(),
          x: mob.x,
          y: mob.y,
          rewardSize: drop.size,
          vx: powerVelocity.vx,
          vy: powerVelocity.vy,
        }),
      );
    }
  }

  private sortPoints(): void {
    this.points.sort((left, right) => left.id - right.id);
  }

  private tryCollectPoint(
    point: PointState,
    collectors: readonly PointCollector[],
  ): void {
    for (const collector of collectors) {
      const state = collector.state;
      if (state.deadUntil > 0) {
        continue;
      }
      const fpDistance = fpHypotFp(
        fp.sub(fp.fromFloat(point.x), fp.fromFloat(state.x)),
        fp.sub(fp.fromFloat(point.y), fp.fromFloat(state.y)),
      );
      if (fp.lte(fpDistance, fp.fromFloat(collector.getPointCollectRadius()))) {
        point.collectingBy = state.key;
        point.collectTicksRemaining = POINT_COLLECT_TICKS;
        return;
      }
    }
  }

  private awardPoint(
    point: PointState,
    collectors: readonly PointCollector[],
  ): void {
    const fighter = collectors.find(
      (collector) => collector.state.key === point.collectingBy,
    )?.state;
    if (fighter) {
      if (point.rewardKind === "point" || point.rewardKind === "power") {
        fighter.pointCount = Math.min(
          POINT_COUNT_MAX,
          fighter.pointCount + point.value,
        );
      }
      this.onAward?.({ collectorKey: fighter.key, point });
    }
  }
}

function rewardDrops<TSize extends string>(
  drops: readonly RewardDropState[] | undefined,
  fallbackSize: TSize | undefined,
): readonly { readonly size: TSize }[] {
  if (drops && drops.length > 0) {
    return drops.flatMap((drop) =>
      Array.from({ length: Math.max(1, drop.count ?? 1) }, () => ({
        size: drop.size as TSize,
      })),
    );
  }
  return fallbackSize ? [{ size: fallbackSize }] : [];
}

function dropSeed(mobId: number, dropIndex: number): number {
  return (Math.imul(mobId, 0x45d9f3b) + Math.imul(dropIndex + 1, 0x119de1f3)) >>> 0;
}

export function clampPointCount(pointCount: number): number {
  if (!Number.isFinite(pointCount)) {
    return 0;
  }
  return Math.max(0, Math.min(POINT_COUNT_MAX, Math.floor(pointCount)));
}
