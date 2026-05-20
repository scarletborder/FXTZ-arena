import { fp } from "@shaisrc/fixed-point";

import { bulletSpeedRankToPixelsPerTick } from "@repo/types";

import type { FighterKey, ProjectileState } from "../../types";
import { fpMin } from "../../fp";
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

  const fpAngle = fp.fromFloat(params.angle);
  const fpCos = fp.cos(fpAngle);
  const fpSin = fp.sin(fpAngle);
  const fpOffset = fp.fromFloat(spawnOffset);
  const fpV = fp.fromFloat(velocity);
  const fpX = fp.fromFloat(params.x);
  const fpY = fp.fromFloat(params.y);

  const laserX = params.rayLike
    ? params.x
    : fp.toFloat(fp.add(fpX, fp.mul(fpCos, fpOffset)));
  const laserY = params.rayLike
    ? params.y
    : fp.toFloat(fp.add(fpY, fp.mul(fpSin, fpOffset)));

  return {
    id: params.id,
    kind: params.kind ?? "laser",
    owner: params.owner,
    x: laserX,
    y: laserY,
    previousX: laserX,
    previousY: laserY,
    vx: fp.toFloat(fp.mul(fpCos, fpV)),
    vy: fp.toFloat(fp.mul(fpSin, fpV)),
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
  if (projectile.widthGrowthPerTick > 0 && Number.isFinite(projectile.width)) {
    // Use fp for width growth
    const fpWidth = fp.fromFloat(projectile.width);
    const fpGrowth = fp.fromFloat(projectile.widthGrowthPerTick);
    const fpMaxW = projectile.maxWidth !== undefined && Number.isFinite(projectile.maxWidth)
      ? fp.fromFloat(projectile.maxWidth)
      : fp.fromInt(9999);
    const newWidth = fpMin(fpMaxW, fp.add(fpWidth, fpGrowth));
    projectile.width = fp.toFloat(newWidth);
  }

  if (projectile.anchorX !== undefined && projectile.anchorY !== undefined && Number.isFinite(projectile.width)) {
    // anchored laser end position: anchor + cos(angle) * (width / 2)
    const fpAnchorX = fp.fromFloat(projectile.anchorX);
    const fpAnchorY = fp.fromFloat(projectile.anchorY);
    const fpAngle = fp.fromFloat(projectile.angle);
    const fpCos = fp.cos(fpAngle);
    const fpSin = fp.sin(fpAngle);
    const fpHalfW = fp.div(fp.fromFloat(projectile.width), fp.fromInt(2));

    projectile.x = fp.toFloat(fp.add(fpAnchorX, fp.mul(fpCos, fpHalfW)));
    projectile.y = fp.toFloat(fp.add(fpAnchorY, fp.mul(fpSin, fpHalfW)));
  }

  // Position step (always in world-space for non-anchored lasers)
  projectile.x = fp.toFloat(fp.add(fp.fromFloat(projectile.x), fp.fromFloat(projectile.vx)));
  projectile.y = fp.toFloat(fp.add(fp.fromFloat(projectile.y), fp.fromFloat(projectile.vy)));
}

export { isProjectileOutOfWorld };
