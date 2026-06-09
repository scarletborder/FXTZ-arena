export const ARENA_WIDTH = 1200;
export const ARENA_HEIGHT = 720;
export const COLLABORATE_ARENA_WIDTH = 2400;
export const COLLABORATE_ARENA_HEIGHT = 1440;
export const COLLABORATE_VIEWPORT_WIDTH = 1200;
export const COLLABORATE_VIEWPORT_HEIGHT = 720;
export const HIT_CIRCLE_DIAMETER = 3;

export const ARENA_WIDTH_PX = 1200;
export const ARENA_HEIGHT_PX = 720;
export const PLAYER_CORE_RADIUS = 4.5;
export const GRAZE_CIRCLE_DIAMETER = PLAYER_CORE_RADIUS * 10;
export const PLAYER_RADIUS_UNITS = 2;
export const PROJECTILE_RADIUS = 5;

export interface ArenaBounds {
  readonly width: number;
  readonly height: number;
  readonly viewportWidth: number;
  readonly viewportHeight: number;
}

export const DEFAULT_ARENA_BOUNDS: ArenaBounds = {
  width: ARENA_WIDTH,
  height: ARENA_HEIGHT,
  viewportWidth: ARENA_WIDTH_PX,
  viewportHeight: ARENA_HEIGHT_PX,
};

export const COLLABORATE_ARENA_BOUNDS: ArenaBounds = {
  width: COLLABORATE_ARENA_WIDTH,
  height: COLLABORATE_ARENA_HEIGHT,
  viewportWidth: COLLABORATE_VIEWPORT_WIDTH,
  viewportHeight: COLLABORATE_VIEWPORT_HEIGHT,
};

export function normalizeArenaBounds(
  bounds?: Partial<ArenaBounds>,
): ArenaBounds {
  return {
    width: bounds?.width ?? DEFAULT_ARENA_BOUNDS.width,
    height: bounds?.height ?? DEFAULT_ARENA_BOUNDS.height,
    viewportWidth: bounds?.viewportWidth ?? DEFAULT_ARENA_BOUNDS.viewportWidth,
    viewportHeight:
      bounds?.viewportHeight ?? DEFAULT_ARENA_BOUNDS.viewportHeight,
  };
}
