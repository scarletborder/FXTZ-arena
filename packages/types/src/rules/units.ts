import { ARENA_WIDTH, HIT_CIRCLE_DIAMETER, TICK_RATE } from "../core";
import type { SpeedRank } from "../core";

export const SPEED_RANK_PIXELS_PER_TICK: Readonly<Record<SpeedRank, number>> =
  {
    low: 2,
    medium: 4,
    high: 5,
  };

export const BULLET_SPEED_RANK_WIDTH_SECONDS: Readonly<
  Record<SpeedRank, number>
> = {
  low: 6,
  medium: 4,
  high: 2,
};

export const HIT_CIRCLE_DIAMETER_MULTIPLIERS = {
  normalBulletWidth: 1,
  reimuBulletLength: 2,
  marisaLaserWidth: 3,
  marisaLaserMaxLength: 16,
  reimuBombClearRadius: 6,
  marisaBombClearRadius: 8,
  sakuyaBombClearRadius: 8,
  spiritStrikeClearRadius: 4,
} as const;

export function secondsToTicks(seconds: number): number {
  return Math.round(seconds * TICK_RATE);
}

export function speedRankToPixelsPerTick(speedRank: SpeedRank): number {
  return SPEED_RANK_PIXELS_PER_TICK[speedRank];
}

export function bulletSpeedRankToPixelsPerTick(
  speedRank: SpeedRank,
  arenaWidth = ARENA_WIDTH,
): number {
  return arenaWidth / secondsToTicks(BULLET_SPEED_RANK_WIDTH_SECONDS[speedRank]);
}

export function hitCircleUnits(multiplier: number): number {
  return HIT_CIRCLE_DIAMETER * multiplier;
}
