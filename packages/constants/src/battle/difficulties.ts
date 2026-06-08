export type DifficultyConfig = {
  // 聪明时间倍率，单位1.0，越大聪明时间越长
  smartDurationRatio: number;
  // 钝化时间倍率，单位1.0，越大钝化时间越长(越聪明)
  dumbRampRatio: number;
  // 初始ai point, 0~300
  initialAIPoint: number;
}

export enum EnumDifficulty {
  Easy = 'easy',
  Normal = 'normal',
  Hard = 'hard',
  Lunatic = 'lunatic',
}

export const DIFFICULTY_CONFIGS: Record<EnumDifficulty, DifficultyConfig> = {
  [EnumDifficulty.Easy]: {
    smartDurationRatio: 0.8,
    dumbRampRatio: 0.6,
    initialAIPoint: 0,
  },
  [EnumDifficulty.Normal]: {
    smartDurationRatio: 1.0,
    dumbRampRatio: 1.0,
    initialAIPoint: 35,
  },
  [EnumDifficulty.Hard]: {
    smartDurationRatio: 1.2,
    dumbRampRatio: 1.5,
    initialAIPoint: 75,
  },
  [EnumDifficulty.Lunatic]: {
    smartDurationRatio: 1.5,
    dumbRampRatio: 2.0,
    initialAIPoint: 110,
  },
};