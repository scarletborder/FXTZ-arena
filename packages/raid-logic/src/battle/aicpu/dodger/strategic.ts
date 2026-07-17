import { ARENA_HEIGHT_PX, ARENA_WIDTH_PX } from "@repo/types";
import type { FighterState } from "@repo/types";

import { WALL_MARGIN } from "./constants";
import type { MoveOption } from "./types";

export function strategicMovement(
  self: FighterState,
  opponent: FighterState,
): MoveOption {
  const dx = opponent.x - self.x;
  const dy = opponent.y - self.y;
  const dist = Math.max(0.001, Math.hypot(dx, dy));
  let targetX = 0;
  let targetY = 0;

  if (dist < 150) {
    targetX = -dx / dist;
    targetY = -dy / dist;
  } else if (dist > 400) {
    targetX = dx / dist;
    targetY = dy / dist;
  } else {
    targetX = -dy / dist;
    targetY = dx / dist;
  }

  targetX += wallAvoidance(self.x, WALL_MARGIN, ARENA_WIDTH_PX);
  targetY += wallAvoidance(self.y, WALL_MARGIN, ARENA_HEIGHT_PX);

  return {
    x: sign(targetX),
    y: sign(targetY),
  };
}

export function wallAvoidance(
  pos: number,
  margin: number,
  max: number,
): number {
  if (pos < margin) return (margin - pos) / margin;
  if (pos > max - margin) return (max - margin - pos) / margin;
  return 0;
}

export function sign(value: number): -1 | 0 | 1 {
  if (value > 0.3) return 1;
  if (value < -0.3) return -1;
  return 0;
}
