export const POINT_REWARD_VALUES = {
  small: 10,
  medium: 25,
  large: 50,
} as const;

export type PointRewardSize = keyof typeof POINT_REWARD_VALUES;
