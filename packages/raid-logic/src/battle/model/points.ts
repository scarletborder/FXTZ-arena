import { fp } from "@shaisrc/fixed-point";

import { ARENA_HEIGHT, ARENA_WIDTH, speedRankToPixelsPerTick, type SpeedRank } from "@repo/types";
import type { PointPrefabId, PointState } from "@repo/content";

export const POINT_COLLECT_TICKS = 10;

interface PointPrefab {
  readonly prefabId: PointPrefabId;
  readonly value: number;
  readonly size: number;
}

const POINT_PREFABS: readonly PointPrefab[] = [
  { prefabId: "point_1", value: 1, size: 8 },
  { prefabId: "point_5", value: 5, size: 12 },
  { prefabId: "point_10", value: 10, size: 16 },
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
  readonly value: number;
  readonly vx: number;
  readonly vy: number;
}): PointState {
  const prefab = prefabForValue(params.value);
  return {
    id: params.id,
    prefabId: prefab.prefabId,
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

export function pointVelocityFromFrame(frame: number, speedRank: SpeedRank = "low"): { readonly vx: number; readonly vy: number } {
  const direction = FRAME_DIRECTIONS[positiveModulo(frame, FRAME_DIRECTIONS.length)]!;
  const fpSpeed = fp.fromFloat(speedRankToPixelsPerTick(speedRank));
  return {
    vx: fp.toFloat(fp.mul(fp.fromFloat(direction[0]), fpSpeed)),
    vy: fp.toFloat(fp.mul(fp.fromFloat(direction[1]), fpSpeed)),
  };
}

export function pointIsOutsideArena(point: PointState): boolean {
  const halfSize = fp.div(fp.fromFloat(point.size), fp.fromInt(2));
  const fpX = fp.fromFloat(point.x);
  const fpY = fp.fromFloat(point.y);
  return fp.lt(fpX, fp.negate(halfSize)) ||
    fp.gt(fpX, fp.add(fp.fromFloat(ARENA_WIDTH), halfSize)) ||
    fp.lt(fpY, fp.negate(halfSize)) ||
    fp.gt(fpY, fp.add(fp.fromFloat(ARENA_HEIGHT), halfSize));
}

function prefabForValue(value: number): PointPrefab {
  const prefab = POINT_PREFABS.find((candidate) => candidate.value === value);
  if (!prefab) {
    throw new Error(`Unsupported point value: ${value}`);
  }
  return prefab;
}

function positiveModulo(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor;
}
