import type { FighterState, ProjectileState } from "@repo/content";

import type { ProjectedProjectile } from "./types";

export function projectProjectile(
  projectile: ProjectileState,
  frame: number,
  tick: number,
  target: FighterState,
): ProjectedProjectile {
  let x = projectile.x;
  let y = projectile.y;
  let previousX = projectile.previousX;
  let previousY = projectile.previousY;
  let vx = projectile.vx;
  let vy = projectile.vy;
  let angle = projectile.angle;
  let width = projectile.width;
  let retargetAt = projectile.retargetAt;

  for (let step = 0; step < tick; step += 1) {
    const stepFrame = frame + step;
    previousX = x;
    previousY = y;

    if (stepFrame < projectile.pausedUntil) {
      continue;
    }

    if (
      projectile.kind === "laser" ||
      projectile.kind === "spark"
    ) {
      if (projectile.widthGrowthPerTick > 0 && Number.isFinite(width)) {
        width = Math.min(projectile.maxWidth ?? Number.POSITIVE_INFINITY, width + projectile.widthGrowthPerTick);
      }
      if (
        projectile.anchorX !== undefined &&
        projectile.anchorY !== undefined &&
        Number.isFinite(width)
      ) {
        x = projectile.anchorX + Math.cos(angle) * (width / 2);
        y = projectile.anchorY + Math.sin(angle) * (width / 2);
      }
      x += vx;
      y += vy;
      continue;
    }

    if (retargetAt !== undefined && stepFrame >= retargetAt) {
      const dx = target.x - x;
      const dy = target.y - y;
      const speed = Math.max(1.5, Math.hypot(vx, vy));
      angle = Math.atan2(dy, dx);
      vx = Math.cos(angle) * speed;
      vy = Math.sin(angle) * speed;
      retargetAt = undefined;
    }

    if (
      projectile.kind === "orb" &&
      stepFrame >= projectile.homingStartAt &&
      stepFrame <= projectile.homingUntil
    ) {
      const dx = target.x - x;
      const dy = target.y - y;
      const len = Math.max(1, Math.hypot(dx, dy));
      const speed = Math.max(1.5, Math.hypot(vx, vy));
      vx = vx * 0.88 + (dx / len) * speed * 0.12;
      vy = vy * 0.88 + (dy / len) * speed * 0.12;
    }

    x += vx;
    y += vy;
    angle = Math.atan2(vy, vx);
  }

  return {
    kind: projectile.kind,
    x,
    y,
    previousX,
    previousY,
    vx,
    vy,
    width,
    height: projectile.height,
    angle,
    damage: projectile.damage,
  };
}

export function projectileCanThreaten(
  projectile: ProjectileState,
  self: FighterState,
  frame: number,
): boolean {
  if (projectile.owner === self.key) return false;
  if (projectile.damage <= 0) return false;
  if (frame < projectile.visibleFrom) return false;
  if (projectile.expireAt !== undefined && frame > projectile.expireAt) return false;
  if (projectile.pausedUntil > frame) return false;
  if (projectile.width <= 0 || projectile.height <= 0) return false;
  return true;
}
