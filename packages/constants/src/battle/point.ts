export const POINT_REWARD_VALUES = {
  small: 15,
  medium: 30,
  large: 60,
} as const;

export type PointRewardSize = keyof typeof POINT_REWARD_VALUES;
