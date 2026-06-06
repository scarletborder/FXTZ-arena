import { PLAYER_CORE_RADIUS } from "@repo/types";

import type { ProjectedProjectile } from "./types";
import { SAFETY_PADDING, THREAT_CLEARANCE } from "./constants";

export interface CollisionProbe {
  readonly collides: boolean;
  readonly clearance: number;
}

export function projectileCollisionProbe(
  projectile: ProjectedProjectile,
  fighterX: number,
  fighterY: number,
  hitCircleRadiusMultiplier: number,
): CollisionProbe {
  const hitRadius = PLAYER_CORE_RADIUS * hitCircleRadiusMultiplier;
  const clearance = projectileClearance(projectile, fighterX, fighterY) - hitRadius;
  return {
    collides: clearance <= SAFETY_PADDING,
    clearance,
  };
}

export function projectileIsThreatening(clearance: number): boolean {
  return clearance < THREAT_CLEARANCE;
}

export function sweptProjectileBody(projectile: ProjectedProjectile): ProjectedProjectile {
  if (projectile.kind === "laser" || projectile.kind === "spark") {
    return projectile;
  }

  const dx = projectile.x - projectile.previousX;
  const dy = projectile.y - projectile.previousY;
  const dist = Math.hypot(dx, dy);
  if (dist <= 0.5) {
    return projectile;
  }

  return {
    ...projectile,
    x: (projectile.previousX + projectile.x) / 2,
    y: (projectile.previousY + projectile.y) / 2,
    width: Math.max(1, dist + projectile.width),
    height: Math.max(1, Math.max(projectile.width, projectile.height)),
    angle: Math.atan2(dy, dx),
  };
}

function projectileClearance(
  projectile: ProjectedProjectile,
  x: number,
  y: number,
): number {
  if (!Number.isFinite(projectile.width)) {
    return distanceToRay(projectile, x, y);
  }
  return distanceToRotatedRect(projectile, x, y);
}

function distanceToRotatedRect(
  projectile: ProjectedProjectile,
  x: number,
  y: number,
): number {
  const dx = x - projectile.x;
  const dy = y - projectile.y;
  const cos = Math.cos(projectile.angle);
  const sin = Math.sin(projectile.angle);
  const localX = dx * cos + dy * sin;
  const localY = -dx * sin + dy * cos;
  const halfW = projectile.width / 2;
  const halfH = projectile.height / 2;
  const closestX = clamp(localX, -halfW, halfW);
  const closestY = clamp(localY, -halfH, halfH);
  return Math.hypot(localX - closestX, localY - closestY);
}

function distanceToRay(projectile: ProjectedProjectile, x: number, y: number): number {
  const dx = x - projectile.x;
  const dy = y - projectile.y;
  const cos = Math.cos(projectile.angle);
  const sin = Math.sin(projectile.angle);
  const forward = dx * cos + dy * sin;
  const side = Math.abs(-dx * sin + dy * cos);
  const halfH = projectile.height / 2;

  if (forward >= 0) {
    return Math.max(0, side - halfH);
  }

  return Math.hypot(forward, Math.max(0, side - halfH));
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
