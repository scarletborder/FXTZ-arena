import type { MoneyRewardSize, PointRewardSize } from "./point";

export type CollaborateScoredMobClass = "minion" | "elite" | "boss";

export const COLLABORATE_MOB_SCORE_VALUES: Readonly<
  Record<CollaborateScoredMobClass, number>
> = {
  minion: 100,
  elite: 1_000,
  boss: 10_000,
} as const;

export const COLLABORATE_POINT_PICKUP_SCORE_VALUES: Readonly<
  Record<PointRewardSize, number>
> = {
  small: 15,
  medium: 30,
  large: 60,
} as const;

export const COLLABORATE_MONEY_PICKUP_SCORE_VALUES: Readonly<
  Record<MoneyRewardSize, number>
> = {
  small: 15,
  medium: 30,
  large: 60,
} as const;

export const COLLABORATE_GRAZE_SCORE = 5;
