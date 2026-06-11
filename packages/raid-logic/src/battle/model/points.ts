import { fp } from "@shaisrc/fixed-point";

import {
  MONEY_REWARD_VALUES,
  POINT_REWARD_VALUES,
  type MoneyRewardSize,
  type PointRewardSize,
} from "@repo/constants";
import {
  DEFAULT_ARENA_BOUNDS,
  speedRankToPixelsPerTick,
  type ArenaBounds,
  type SpeedRank,
} from "@repo/types";
import type {
  CollectibleRewardSize,
  PointPrefabId,
  PointRewardKind,
  PointState,
} from "@repo/content";

export const POINT_COLLECT_TICKS = 10;

interface PointPrefab {
  readonly prefabId: PointPrefabId;
  readonly rewardKind: PointRewardKind;
  readonly rewardSize: CollectibleRewardSize;
  readonly value: number;
  readonly size: number;
}

const POINT_PREFABS: readonly PointPrefab[] = [
  {
    prefabId: "point_small",
    rewardKind: "point",
    rewardSize: "small",
    value: POINT_REWARD_VALUES.small,
    size: 15,
  },
  {
    prefabId: "point_medium",
    rewardKind: "point",
    rewardSize: "medium",
    value: POINT_REWARD_VALUES.medium,
    size: 25,
  },
  {
    prefabId: "point_large",
    rewardKind: "point",
    rewardSize: "large",
    value: POINT_REWARD_VALUES.large,
    size: 35,
  },
  {
    prefabId: "money_small",
    rewardKind: "money",
    rewardSize: "small",
    value: MONEY_REWARD_VALUES.small,
    size: 15,
  },
  {
    prefabId: "money_medium",
    rewardKind: "money",
    rewardSize: "medium",
    value: MONEY_REWARD_VALUES.medium,
    size: 25,
  },
  {
    prefabId: "money_large",
    rewardKind: "money",
    rewardSize: "large",
    value: MONEY_REWARD_VALUES.large,
    size: 35,
  },
];

const SQRT_HALF = 0.7071067811865476;
const FRAME_DIRECTIONS: readonly (readonly [number, number])[] = [
  [0, -1],
  [SQRT_HALF, -SQRT_HALF],
  [1, 0],
  [SQRT_HALF, SQRT_HALF],
  [0, 1],
  [-SQRT_HALF, SQRT_HALF],
  [-1, 0],
  [-SQRT_HALF, -SQRT_HALF],
];

export function createPointState(params: {
  readonly id: number;
  readonly x: number;
  readonly y: number;
  readonly rewardSize: PointRewardSize;
  readonly vx: number;
  readonly vy: number;
}): PointState {
  return createCollectibleState({
    ...params,
    rewardKind: "point",
  });
}

export function createMoneyState(params: {
  readonly id: number;
  readonly x: number;
  readonly y: number;
  readonly rewardSize: MoneyRewardSize;
  readonly vx: number;
  readonly vy: number;
}): PointState {
  return createCollectibleState({
    ...params,
    rewardKind: "money",
  });
}

function createCollectibleState(params: {
  readonly id: number;
  readonly x: number;
  readonly y: number;
  readonly rewardKind: PointRewardKind;
  readonly rewardSize: CollectibleRewardSize;
  readonly vx: number;
  readonly vy: number;
}): PointState {
  const prefab = prefabForReward(params.rewardKind, params.rewardSize);
  return {
    id: params.id,
    prefabId: prefab.prefabId,
    rewardKind: prefab.rewardKind,
    rewardSize: prefab.rewardSize,
    x: params.x,
    y: params.y,
    previousX: params.x,
    previousY: params.y,
    vx: params.vx,
    vy: params.vy,
    size: prefab.size,
    value: prefab.value,
    active: true,
    collectingBy: undefined,
    collectTicksRemaining: 0,
  };
}

export function pointVelocityFromFrame(
  frame: number,
  speedRank: SpeedRank = "low",
  seed = 0,
): { readonly vx: number; readonly vy: number } {
  const direction =
    FRAME_DIRECTIONS[positiveModulo(frame + seed, FRAME_DIRECTIONS.length)]!;
  const fpSpeed = fp.fromFloat(speedRankToPixelsPerTick(speedRank));
  return {
    vx: fp.toFloat(fp.mul(fp.fromFloat(direction[0]), fpSpeed)),
    vy: fp.toFloat(fp.mul(fp.fromFloat(direction[1]), fpSpeed)),
  };
}

export function pointIsOutsideArena(
  point: PointState,
  arenaBounds: ArenaBounds = DEFAULT_ARENA_BOUNDS,
): boolean {
  const halfSize = fp.div(fp.fromFloat(point.size), fp.fromInt(2));
  const fpX = fp.fromFloat(point.x);
  const fpY = fp.fromFloat(point.y);
  return (
    fp.lt(fpX, fp.negate(halfSize)) ||
    fp.gt(fpX, fp.add(fp.fromFloat(arenaBounds.width), halfSize)) ||
    fp.lt(fpY, fp.negate(halfSize)) ||
    fp.gt(fpY, fp.add(fp.fromFloat(arenaBounds.height), halfSize))
  );
}

function prefabForReward(
  rewardKind: PointRewardKind,
  rewardSize: CollectibleRewardSize,
): PointPrefab {
  const prefab = POINT_PREFABS.find(
    (candidate) =>
      candidate.rewardKind === rewardKind &&
      candidate.rewardSize === rewardSize,
  );
  if (!prefab) {
    throw new Error(`Unsupported ${rewardKind} reward size: ${rewardSize}`);
  }
  return prefab;
}

function positiveModulo(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor;
}
