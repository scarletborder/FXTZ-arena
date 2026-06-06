import type { MoveOption } from "./types";

export const WALL_MARGIN = 48;
export const SOFT_WALL_MARGIN = 140;
export const LOCAL_SCAN_RADIUS = 520;
export const LOCAL_SCAN_RADIUS_LASER = 760;
export const MAX_LOCAL_PROJECTILES = 96;
export const VELOCITY_OBSTACLE_HORIZON_TICKS = 34;
export const EMERGENCY_BOMB_LOOKAHEAD_TICKS = 2;
export const SAFETY_PADDING = 2.5;
export const THREAT_CLEARANCE = 22;
export const MOVE_STAY_PENALTY = 1.75;
export const PREVIOUS_MOVE_BONUS = 0.35;

export const MOVES: readonly MoveOption[] = [
  { x: 0, y: 0 },
  { x: 1, y: 0 },
  { x: -1, y: 0 },
  { x: 0, y: 1 },
  { x: 0, y: -1 },
  { x: 1, y: 1 },
  { x: 1, y: -1 },
  { x: -1, y: 1 },
  { x: -1, y: -1 },
];
