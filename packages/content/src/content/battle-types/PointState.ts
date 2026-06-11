import type { FighterKey } from "./common";

export type PointRewardKind = "point" | "money";
export type CollectibleRewardSize = "small" | "medium" | "large";
export type PointPrefabId =
  | "point_small"
  | "point_medium"
  | "point_large"
  | "money_small"
  | "money_medium"
  | "money_large";

export interface PointState {
  readonly id: number;
  readonly prefabId: PointPrefabId;
  readonly rewardKind: PointRewardKind;
  readonly rewardSize: CollectibleRewardSize;
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
