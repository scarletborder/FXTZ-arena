import { ARENA_HEIGHT_PX, ARENA_WIDTH_PX } from "./size";

export { FIXED_STEP_MS, HIT_FLASH_MS } from "../sync";
export { ARENA_HEIGHT_PX, ARENA_WIDTH_PX, PLAYER_CORE_RADIUS, PROJECTILE_RADIUS } from "./size";

export const GAME_WIDTH = 1280;
export const GAME_HEIGHT = 720;
export const ARENA_LEFT = 0;
export const ARENA_TOP = 0;
export const ARENA_OFFSET_Y = Math.round((GAME_HEIGHT - ARENA_HEIGHT_PX) / 2);
export const ARENA_RIGHT = ARENA_LEFT + ARENA_WIDTH_PX;
export const ARENA_BOTTOM = ARENA_TOP + ARENA_HEIGHT_PX;
export const SIDEBAR_LEFT = 976;
export const SIDEBAR_TOP = 16;
export const PLAYER_SPAWN = { x: 180, y: 280 };
export const TARGET_SPAWN = { x: 760, y: 280 };
export const END_OVERLAY_WIDTH = 540;
export const END_OVERLAY_HEIGHT = 200;
