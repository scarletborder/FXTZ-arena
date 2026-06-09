import type { ProjectileState } from "@repo/raid-logic";
import { OWN_PROJECTILE_ALPHA } from "@repo/constants";
import type { BattleRoomMode } from "@repo/types";

import type { FighterKey, ProjectileDisplay } from "./types";

const PROJECTILE_PREVIEW_ALPHA = 0.85;
const INFINITE_LASER_RENDER_LENGTH = 1600;

export function shouldRenderPreviewLine(projectile: ProjectileState): boolean {
  return (
    projectile.kind === "laser" &&
    projectile.damage === 0 &&
    !Number.isFinite(projectile.width)
  );
}

export function projectileAlpha(
  projectile: ProjectileState,
  localFighterKey: FighterKey,
  battleMode: BattleRoomMode = "versus",
): number {
  if (
    projectile.owner === localFighterKey ||
    (battleMode === "collaborate" &&
      (projectile.owner === "Player1" || projectile.owner === "Player2"))
  ) {
    return OWN_PROJECTILE_ALPHA;
  }
  return projectile.damage === 0 ? PROJECTILE_PREVIEW_ALPHA : 1;
}

export function projectileDisplay(
  projectile: ProjectileState,
  alpha: number,
): ProjectileDisplay {
  if (
    (projectile.kind === "laser" || projectile.kind === "spark") &&
    !Number.isFinite(projectile.width)
  ) {
    const length = INFINITE_LASER_RENDER_LENGTH;
    return {
      x: projectile.x + Math.cos(projectile.angle) * (length / 2),
      y: projectile.y + Math.sin(projectile.angle) * (length / 2),
      width: length,
      height: projectile.renderHeight ?? projectile.height,
    };
  }

  const width =
    Number.isFinite(projectile.previousWidth) &&
    Number.isFinite(projectile.width)
      ? lerp(projectile.previousWidth, projectile.width, alpha)
      : projectile.width;
  return {
    x: lerp(projectile.previousX, projectile.x, alpha),
    y: lerp(projectile.previousY, projectile.y, alpha),
    width: projectile.renderWidth ?? width,
    height: projectile.renderHeight ?? projectile.height,
  };
}

function lerp(from: number, to: number, alpha: number): number {
  return from + (to - from) * alpha;
}
