import { ARENA_HEIGHT_PX, ARENA_WIDTH_PX } from "@repo/constants";

const ARENA_ASPECT_RATIO = ARENA_WIDTH_PX / ARENA_HEIGHT_PX;

export interface BattleLayout {
  readonly width: number;
  readonly height: number;
  readonly arenaInsetX: number;
  readonly arenaInsetY: number;
}

export function createBattleLayout(): BattleLayout {
  const viewport = readViewportSize();
  const viewportAspect =
    viewport.width > 0 && viewport.height > 0
      ? viewport.width / viewport.height
      : ARENA_ASPECT_RATIO;
  const width =
    viewportAspect >= ARENA_ASPECT_RATIO
      ? Math.round(ARENA_HEIGHT_PX * viewportAspect)
      : ARENA_WIDTH_PX;
  const height =
    viewportAspect >= ARENA_ASPECT_RATIO
      ? ARENA_HEIGHT_PX
      : Math.round(ARENA_WIDTH_PX / viewportAspect);
  return {
    width,
    height,
    arenaInsetX: Math.max(0, Math.round((width - ARENA_WIDTH_PX) / 2)),
    arenaInsetY: Math.max(0, Math.round((height - ARENA_HEIGHT_PX) / 2)),
  };
}

export function sameBattleLayout(
  left: BattleLayout | undefined,
  right: BattleLayout,
): boolean {
  return (
    left !== undefined &&
    left.width === right.width &&
    left.height === right.height &&
    left.arenaInsetX === right.arenaInsetX &&
    left.arenaInsetY === right.arenaInsetY
  );
}

export function readViewportSize(): {
  readonly width: number;
  readonly height: number;
} {
  const viewport = window.visualViewport;
  return {
    width: Math.max(1, Math.round(viewport?.width ?? window.innerWidth)),
    height: Math.max(1, Math.round(viewport?.height ?? window.innerHeight)),
  };
}
