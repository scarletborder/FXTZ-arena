import { bulletSpeedRankToPixelsPerTick } from "@repo/types";

import type { FighterKey, ProjectileState } from "../../types";
import { isProjectileOutOfWorld } from "./bullet";

export function createLaserProjectile(params: {
  readonly id: number;
  readonly owner: FighterKey;
  readonly kind?: "laser" | "spark";
  readonly x: number;
  readonly y: number;
  readonly angle: number;
  readonly frame: number;
  readonly width?: number;
  readonly height?: number;
  readonly speedRank?: "low" | "medium" | "high";
  readonly expireTicks?: number;
  readonly initialLength?: number;
  readonly maxLength?: number;
  readonly lengthGrowthPerTick?: number;
  readonly damage?: number;
  readonly spawnOffset?: number;
  readonly pinned?: boolean;
  readonly anchored?: boolean;
  readonly rayLike?: boolean;
  readonly visibleFrom?: number;
}): ProjectileState {
  const speed = bulletSpeedRankToPixelsPerTick(params.speedRank ?? "high");
  const spawnOffset = params.spawnOffset ?? 28;
  const velocity = params.pinned ? 0 : speed;
  const width = params.rayLike ? Number.POSITIVE_INFINITY : (params.initialLength ?? 3);
  const x = params.rayLike ? params.x : params.x + Math.cos(params.angle) * spawnOffset;
  const y = params.rayLike ? params.y : params.y + Math.sin(params.angle) * spawnOffset;
  return {
    id: params.id,
    kind: params.kind ?? "laser",
    owner: params.owner,
    x,
    y,
    previousX: x,
    previousY: y,
    vx: Math.cos(params.angle) * velocity,
    vy: Math.sin(params.angle) * velocity,
    width,
    previousWidth: width,
    height: params.height ?? 9,
    anchorX: params.anchored ? params.x : undefined,
    anchorY: params.anchored ? params.y : undefined,
    visibleFrom: params.visibleFrom ?? params.frame,
    expireAt: params.expireTicks === undefined ? undefined : params.frame + params.expireTicks,
    homingStartAt: 0,
    homingUntil: 0,
    pausedUntil: params.frame,
    widthGrowthPerTick: params.lengthGrowthPerTick ?? 0,
    maxWidth: params.maxLength,
    damage: params.damage ?? 1,
    pierce: true,
    angle: params.angle,
  };
}

export function stepLaserProjectile(projectile: ProjectileState): void {
  if (projectile.widthGrowthPerTick > 0) {
    projectile.width = Math.min(projectile.maxWidth ?? Number.POSITIVE_INFINITY, projectile.width + projectile.widthGrowthPerTick);
  }
  if (projectile.anchorX !== undefined && projectile.anchorY !== undefined && Number.isFinite(projectile.width)) {
    projectile.x = projectile.anchorX + Math.cos(projectile.angle) * (projectile.width / 2);
    projectile.y = projectile.anchorY + Math.sin(projectile.angle) * (projectile.width / 2);
  }
  projectile.x += projectile.vx;
  projectile.y += projectile.vy;
}

export { isProjectileOutOfWorld };
