import type { FighterKey } from "./common";

export type PointPrefabId = "point_small" | "point_medium" | "point_large";

export interface PointState {
  readonly id: number;
  readonly prefabId: PointPrefabId;
  x: number;
  y: number;
  previousX: number;
  previousY: number;
  vx: number;
  vy: number;
  readonly size: number;
  readonly value: number;
  active: boolean;
  collectingBy: FighterKey | undefined;
  collectTicksRemaining: number;
}
