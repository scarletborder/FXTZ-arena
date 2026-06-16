import { fp } from "@shaisrc/fixed-point";

import {
  MONEY_REWARD_VALUES,
  POINT_REWARD_VALUES,
  POWER_REWARD_VALUES,
  type MoneyRewardSize,
  type PointRewardSize,
  type PowerRewardSize,
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
  {
    prefabId: "power_small",
    rewardKind: "power",
    rewardSize: "small",
    value: POWER_REWARD_VALUES.small,
    size: 15,
  },
  {
    prefabId: "power_medium",
    rewardKind: "power",
    rewardSize: "medium",
    value: POWER_REWARD_VALUES.medium,
    size: 25,
  },
  {
    prefabId: "power_large",
    rewardKind: "power",
    rewardSize: "large",
    value: POWER_REWARD_VALUES.large,
    size: 35,
  },
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

export function createPowerState(params: {
  readonly id: number;
  readonly x: number;
  readonly y: number;
  readonly rewardSize: PowerRewardSize;
  readonly vx: number;
  readonly vy: number;
}): PointState {
  return createCollectibleState({
    ...params,
    rewardKind: "power",
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
  const state = lcg((Math.imul(frame + 1, 0x9e3779b1) ^ seed) >>> 0);
  const angle = ((state & 0xffff) / 0x10000) * Math.PI * 2;
  const fpSpeed = fp.fromFloat(speedRankToPixelsPerTick(speedRank));
  return {
    vx: fp.toFloat(fp.mul(fp.fromFloat(Math.cos(angle)), fpSpeed)),
    vy: fp.toFloat(fp.mul(fp.fromFloat(Math.sin(angle)), fpSpeed)),
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

function lcg(seed: number): number {
  return (Math.imul(seed, 1664525) + 1013904223) >>> 0;
}
