import { fp } from "@shaisrc/fixed-point";

import {
  DEFAULT_ARENA_BOUNDS,
  TICK_RATE,
  type ArenaBounds,
  bulletSpeedRankToPixelsPerTick,
  secondsToTicks,
} from "@repo/types";

import type {
  CharacterDefinition,
  FighterKey,
  FighterState,
  ProjectileState,
} from "@repo/content";
import {
  fpAtan2,
  fpHypotFp,
  fpMax,
  bulletRenderSizeForHitSize,
  getBulletAssetMetrics,
  normalizeBulletHitSize,
} from "@repo/content";

const HOMING_START_DELAY_TICKS = secondsToTicks(0.2);
const HOMING_MAX_TURN_RADIANS_PER_TICK = Math.PI / TICK_RATE;

export function createBulletProjectile(params: {
  readonly id: number;
  readonly owner: FighterKey;
  readonly sourceCharacterId?: CharacterDefinition["id"];
  readonly textureKey?: string;
  readonly kind: "orb" | "knife" | "diamond" | "spark";
  readonly x: number;
  readonly y: number;
  readonly angle: number;
  readonly speedRank: "low" | "medium" | "high";
  readonly width: number;
  readonly height: number;
  readonly laserRenderMode?: ProjectileState["laserRenderMode"];
  readonly frame: number;
  readonly homingTicks: number;
  readonly damage?: number;
  readonly spawnOffset?: number;
  readonly expireTicks?: number;
  readonly pausedUntil?: number;
  readonly retargetAt?: number;
  readonly retargetSpeed?: number;
  readonly retargetX?: number;
  readonly retargetY?: number;
  readonly retargetAimOwner?: FighterKey;
  readonly couldClear?: boolean;
  readonly clearsProjectiles?: boolean;
  readonly piercesTargets?: boolean;
  readonly polarOriginX?: number;
  readonly polarOriginY?: number;
  readonly polarRadius?: number;
  readonly polarAngle?: number;
  readonly polarRadialSpeed?: number;
  readonly polarAngularSpeed?: number;
  readonly polarFollowOwner?: FighterKey;
}): ProjectileState {
  const speed = bulletSpeedRankToPixelsPerTick(params.speedRank);
  const spawnOffset = params.spawnOffset ?? 28;
  const metrics = params.laserRenderMode
    ? undefined
    : getBulletAssetMetrics(params.textureKey);
  const hitSize = normalizeBulletHitSize(
    { width: params.width, height: params.height },
    metrics,
  );
  const renderSize = metrics
    ? bulletRenderSizeForHitSize(hitSize, metrics)
    : undefined;
  const physicsSize = {
    width: Math.round(hitSize.width),
    height: Math.round(hitSize.height),
  };

  const fpAngle = fp.fromFloat(params.angle);
  const fpCos = fp.cos(fpAngle);
  const fpSin = fp.sin(fpAngle);
  const fpOffset = fp.fromFloat(spawnOffset);
  const fpSpeed = fp.fromFloat(speed);
  const fpX = fp.fromFloat(params.x);
  const fpY = fp.fromFloat(params.y);

  const fpx = fp.add(fpX, fp.mul(fpCos, fpOffset));
  const fpy = fp.add(fpY, fp.mul(fpSin, fpOffset));
  const fpvx = fp.mul(fpCos, fpSpeed);
  const fpvy = fp.mul(fpSin, fpSpeed);

  return {
    id: params.id,
    kind: params.kind,
    owner: params.owner,
    sourceCharacterId: params.sourceCharacterId,
    textureKey: params.textureKey,
    x: fp.toFloat(fpx),
    y: fp.toFloat(fpy),
    previousX: fp.toFloat(fpx),
    previousY: fp.toFloat(fpy),
    vx: fp.toFloat(fpvx),
    vy: fp.toFloat(fpvy),
    width: physicsSize.width,
    previousWidth: physicsSize.width,
    previousHeight: physicsSize.height,
    previousRenderHeight: renderSize?.height,
    height: physicsSize.height,
    renderWidth: renderSize?.width,
    renderHeight: renderSize?.height,
    laserRenderMode: params.laserRenderMode,
    anchorX: undefined,
    anchorY: undefined,
    visibleFrom: params.frame,
    expireAt:
      params.expireTicks === undefined
        ? undefined
        : params.frame + params.expireTicks,
    homingStartAt: params.frame + HOMING_START_DELAY_TICKS,
    homingUntil: params.frame + HOMING_START_DELAY_TICKS + params.homingTicks,
    pausedUntil: params.pausedUntil ?? params.frame,
    retargetAt: params.retargetAt,
    retargetSpeed: params.retargetSpeed,
    retargetX: params.retargetX,
    retargetY: params.retargetY,
    retargetAimOwner: params.retargetAimOwner,
    widthGrowthPerTick: 0,
    maxWidth: undefined,
    heightGrowthPerTick: 0,
    maxHeight: undefined,
    renderHeightGrowthPerTick: 0,
    maxRenderHeight: undefined,
    damage: params.damage ?? 1,
    angle: params.angle,
    couldClear: params.couldClear ?? true,
    clearsProjectiles: params.clearsProjectiles ?? false,
    piercesTargets: params.piercesTargets ?? false,
    polarOriginX: params.polarOriginX,
    polarOriginY: params.polarOriginY,
    polarRadius: params.polarRadius,
    polarAngle: params.polarAngle,
    polarRadialSpeed: params.polarRadialSpeed,
    polarAngularSpeed: params.polarAngularSpeed,
    polarFollowOwner: params.polarFollowOwner,
  };
}

export function stepBulletProjectile(
  projectile: ProjectileState,
  frame: number,
  target: FighterState,
): void {
  if (projectile.retargetAt !== undefined && frame >= projectile.retargetAt) {
    retargetProjectile(projectile, target);
    projectile.retargetAt = undefined;
    projectile.retargetSpeed = undefined;
    projectile.retargetX = undefined;
    projectile.retargetY = undefined;
    projectile.retargetAimOwner = undefined;
    projectile.polarOriginX = undefined;
    projectile.polarOriginY = undefined;
    projectile.polarRadius = undefined;
    projectile.polarAngle = undefined;
    projectile.polarRadialSpeed = undefined;
    projectile.polarAngularSpeed = undefined;
    projectile.polarFollowOwner = undefined;
  }

  if (
    projectile.kind === "orb" &&
    frame >= projectile.homingStartAt &&
    frame <= projectile.homingUntil
  ) {
    const fpTx = fp.fromFloat(target.x);
    const fpTy = fp.fromFloat(target.y);
    const fpPx = fp.fromFloat(projectile.x);
    const fpPy = fp.fromFloat(projectile.y);
    const fpDx = fp.sub(fpTx, fpPx);
    const fpDy = fp.sub(fpTy, fpPy);
    const fpVx = fp.fromFloat(projectile.vx);
    const fpVy = fp.fromFloat(projectile.vy);
    const fpSpd = fpMax(fp.fromFloat(1.5), fpHypotFp(fpVx, fpVy));

    const currentAngle = fpAtan2(fpVy, fpVx);
    const targetAngle = fpAtan2(fpDy, fpDx);
    const nextAngle =
      currentAngle +
      clamp(
        normalizeRadians(targetAngle - currentAngle),
        -HOMING_MAX_TURN_RADIANS_PER_TICK,
        HOMING_MAX_TURN_RADIANS_PER_TICK,
      );
    const fpNextAngle = fp.fromFloat(nextAngle);
    const fpNewVx = fp.mul(fp.cos(fpNextAngle), fpSpd);
    const fpNewVy = fp.mul(fp.sin(fpNextAngle), fpSpd);

    projectile.vx = fp.toFloat(fpNewVx);
    projectile.vy = fp.toFloat(fpNewVy);
  }

  if (hasPolarMotion(projectile)) {
    stepPolarProjectile(projectile);
    return;
  }

  // Position step (non-homing: simple fp add)
  projectile.x = fp.toFloat(
    fp.add(fp.fromFloat(projectile.x), fp.fromFloat(projectile.vx)),
  );
  projectile.y = fp.toFloat(
    fp.add(fp.fromFloat(projectile.y), fp.fromFloat(projectile.vy)),
  );
  projectile.angle = fpAtan2(
    fp.fromFloat(projectile.vy),
    fp.fromFloat(projectile.vx),
  );
}

function hasPolarMotion(projectile: ProjectileState): boolean {
  return (
    projectile.polarOriginX !== undefined &&
    projectile.polarOriginY !== undefined &&
    projectile.polarRadius !== undefined &&
    projectile.polarAngle !== undefined &&
    projectile.polarRadialSpeed !== undefined &&
    projectile.polarAngularSpeed !== undefined
  );
}

function stepPolarProjectile(projectile: ProjectileState): void {
  const fpRadius = fp.add(
    fp.fromFloat(projectile.polarRadius!),
    fp.fromFloat(projectile.polarRadialSpeed!),
  );
  const fpAngle = fp.add(
    fp.fromFloat(projectile.polarAngle!),
    fp.fromFloat(projectile.polarAngularSpeed!),
  );
  const fpOriginX = fp.fromFloat(projectile.polarOriginX!);
  const fpOriginY = fp.fromFloat(projectile.polarOriginY!);
  const fpX = fp.add(fpOriginX, fp.mul(fp.cos(fpAngle), fpRadius));
  const fpY = fp.add(fpOriginY, fp.mul(fp.sin(fpAngle), fpRadius));

  projectile.polarRadius = fp.toFloat(fpRadius);
  projectile.polarAngle = fp.toFloat(fpAngle);
  projectile.x = fp.toFloat(fpX);
  projectile.y = fp.toFloat(fpY);
  projectile.vx = fp.toFloat(fp.sub(fpX, fp.fromFloat(projectile.previousX)));
  projectile.vy = fp.toFloat(fp.sub(fpY, fp.fromFloat(projectile.previousY)));
  projectile.angle = fpAtan2(
    fp.fromFloat(projectile.vy),
    fp.fromFloat(projectile.vx),
  );
}

function retargetProjectile(
  projectile: ProjectileState,
  target: FighterState,
): void {
  const targetX = projectile.retargetX ?? target.x;
  const targetY = projectile.retargetY ?? target.y;
  const fpDx = fp.sub(fp.fromFloat(targetX), fp.fromFloat(projectile.x));
  const fpDy = fp.sub(fp.fromFloat(targetY), fp.fromFloat(projectile.y));
  const fpCurrentSpeed = fpHypotFp(
    fp.fromFloat(projectile.vx),
    fp.fromFloat(projectile.vy),
  );
  const speed = fpMax(
    fp.fromFloat(1.5),
    projectile.retargetSpeed === undefined
      ? fpCurrentSpeed
      : fp.fromFloat(projectile.retargetSpeed),
  );
  const angle = fpAtan2(fpDy, fpDx);
  const fpAngle = fp.fromFloat(angle);

  projectile.vx = fp.toFloat(fp.mul(fp.cos(fpAngle), speed));
  projectile.vy = fp.toFloat(fp.mul(fp.sin(fpAngle), speed));
  projectile.angle = angle;
}

function normalizeRadians(angle: number): number {
  let normalized = angle;
  while (normalized > Math.PI) {
    normalized -= Math.PI * 2;
  }
  while (normalized < -Math.PI) {
    normalized += Math.PI * 2;
  }
  return normalized;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function isProjectileOutOfWorld(
  projectile: ProjectileState,
  arenaBounds: ArenaBounds = DEFAULT_ARENA_BOUNDS,
  padding = arenaBounds.width * 0.2,
): boolean {
  if (!Number.isFinite(projectile.width)) {
    return false;
  }
  return (
    projectile.x < -padding ||
    projectile.x > arenaBounds.width + padding ||
    projectile.y < -padding ||
    projectile.y > arenaBounds.height + padding
  );
}
