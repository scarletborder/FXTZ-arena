import { TICK_RATE } from "@repo/constants";

export function secondsToTicks(seconds: number): number {
  return Math.round(seconds * TICK_RATE);
}