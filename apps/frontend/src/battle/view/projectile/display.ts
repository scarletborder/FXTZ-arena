import type { ProjectileState } from "@repo/raid-logic";
import { OWN_PROJECTILE_ALPHA } from "@repo/constants";
import type { BattleRoomMode } from "@repo/types";

import type { FighterKey, ProjectileDisplay } from "./types";

const PROJECTILE_PREVIEW_ALPHA = 0.85;
const INFINITE_LASER_RENDER_LENGTH = 1600;

export interface ProjectileAlphaOptions {
  readonly localSingleDevice?: boolean;
}

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
  options: ProjectileAlphaOptions = {},
): number {
  const visualAlpha =
    projectile.kind === "spark" &&
    (projectile.renderHeight ?? projectile.height) > projectile.height
      ? 0.7
      : 1;
  const treatBothPlayersAsOpponents = options.localSingleDevice === true;
  if (
    (!treatBothPlayersAsOpponents && projectile.owner === localFighterKey) ||
    (battleMode === "collaborate" &&
      (projectile.owner === "Player1" || projectile.owner === "Player2"))
  ) {
    return OWN_PROJECTILE_ALPHA * visualAlpha;
  }
  if (visualAlpha < 1) return visualAlpha;
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
    const height = projectileDisplayHeight(projectile, alpha);
    return {
      x: projectile.x + Math.cos(projectile.angle) * (length / 2),
      y: projectile.y + Math.sin(projectile.angle) * (length / 2),
      width: length,
      height,
    };
  }

  const width =
    Number.isFinite(projectile.previousWidth) &&
    Number.isFinite(projectile.width)
      ? lerp(projectile.previousWidth, projectile.width, alpha)
      : projectile.width;
  const height = projectileDisplayHeight(projectile, alpha);
  const baseX = lerp(projectile.previousX, projectile.x, alpha);
  const baseY = lerp(projectile.previousY, projectile.y, alpha);
  // Apply center offset rotated by the sprite's actual rotation.
  // The sprite is rotated by `angle + PI/2` in the store (for image kind),
  // so the offset must rotate by the same amount to stay texture-relative.
  // Physics body stays at the projectile's logical position (no offset).
  const cosR = Math.cos(projectile.angle + Math.PI / 2);
  const sinR = Math.sin(projectile.angle + Math.PI / 2);
  const ox =
    projectile.centerOffsetX * cosR - projectile.centerOffsetY * sinR;
  const oy =
    projectile.centerOffsetX * sinR + projectile.centerOffsetY * cosR;
  return {
    x: baseX + ox,
    y: baseY + oy,
    width: projectile.renderWidth ?? width,
    height,
  };
}

function projectileDisplayHeight(
  projectile: ProjectileState,
  alpha: number,
): number {
  if (
    Number.isFinite(projectile.previousRenderHeight) &&
    Number.isFinite(projectile.renderHeight)
  ) {
    return lerp(
      projectile.previousRenderHeight ?? 0,
      projectile.renderHeight ?? 0,
      alpha,
    );
  }
  if (
    Number.isFinite(projectile.previousHeight) &&
    Number.isFinite(projectile.height)
  ) {
    return lerp(projectile.previousHeight, projectile.height, alpha);
  }
  return projectile.renderHeight ?? projectile.height;
}

function lerp(from: number, to: number, alpha: number): number {
  return from + (to - from) * alpha;
}
