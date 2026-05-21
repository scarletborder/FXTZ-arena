import { fp } from "@shaisrc/fixed-point";

import { ARENA_WIDTH, bulletSpeedRankToPixelsPerTick, secondsToTicks } from "@repo/types";

import type { FighterKey, FighterState, ProjectileState } from "@repo/content";
import { fpAtan2, fpHypotFp, fpMax } from "@repo/content";

const HOMING_START_DELAY_TICKS = secondsToTicks(0.5);

export function createBulletProjectile(params: {
  readonly id: number;
  readonly owner: FighterKey;
  readonly kind: "orb" | "knife" | "spark";
  readonly x: number;
  readonly y: number;
  readonly angle: number;
  readonly speedRank: "low" | "medium" | "high";
  readonly width: number;
  readonly height: number;
  readonly frame: number;
  readonly homingTicks: number;
  readonly spawnOffset?: number;
  readonly pausedUntil?: number;
}): ProjectileState {
  const speed = bulletSpeedRankToPixelsPerTick(params.speedRank);
  const spawnOffset = params.spawnOffset ?? 28;

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
    x: fp.toFloat(fpx),
    y: fp.toFloat(fpy),
    previousX: fp.toFloat(fpx),
    previousY: fp.toFloat(fpy),
    vx: fp.toFloat(fpvx),
    vy: fp.toFloat(fpvy),
    width: params.width,
    previousWidth: params.width,
    height: params.height,
    anchorX: undefined,
    anchorY: undefined,
    visibleFrom: params.frame,
    expireAt: undefined,
    homingStartAt: params.frame + HOMING_START_DELAY_TICKS,
    homingUntil: params.frame + HOMING_START_DELAY_TICKS + params.homingTicks,
    pausedUntil: params.pausedUntil ?? params.frame,
    widthGrowthPerTick: 0,
    maxWidth: undefined,
    damage: 1,
    pierce: false,
    angle: params.angle,
  };
}

export function stepBulletProjectile(
  projectile: ProjectileState,
  frame: number,
  target: FighterState,
): void {
  if (projectile.kind === "orb" && frame >= projectile.homingStartAt && frame <= projectile.homingUntil) {
    if (!canHomeTo(target)) {
      projectile.homingUntil = frame - 1;
      projectile.x = fp.toFloat(fp.add(fp.fromFloat(projectile.x), fp.fromFloat(projectile.vx)));
      projectile.y = fp.toFloat(fp.add(fp.fromFloat(projectile.y), fp.fromFloat(projectile.vy)));
      projectile.angle = fpAtan2(fp.fromFloat(projectile.vy), fp.fromFloat(projectile.vx));
      return;
    }

    const fpTx = fp.fromFloat(target.x);
    const fpTy = fp.fromFloat(target.y);
    const fpPx = fp.fromFloat(projectile.x);
    const fpPy = fp.fromFloat(projectile.y);
    const fpDx = fp.sub(fpTx, fpPx);
    const fpDy = fp.sub(fpTy, fpPy);
    const fpLen = fpMax(fp.fromInt(1), fpHypotFp(fpDx, fpDy));
    const fpVx = fp.fromFloat(projectile.vx);
    const fpVy = fp.fromFloat(projectile.vy);
    const fpSpd = fpMax(fp.fromFloat(1.5), fpHypotFp(fpVx, fpVy));

    const fp09 = fp.fromFloat(0.9);
    const fp01 = fp.fromFloat(0.1);
    const fpNewVx = fp.add(fp.mul(fpVx, fp09), fp.mul(fp.mul(fp.div(fpDx, fpLen), fpSpd), fp01));
    const fpNewVy = fp.add(fp.mul(fpVy, fp09), fp.mul(fp.mul(fp.div(fpDy, fpLen), fpSpd), fp01));

    projectile.vx = fp.toFloat(fpNewVx);
    projectile.vy = fp.toFloat(fpNewVy);
  }

  // Position step (non-homing: simple fp add)
  projectile.x = fp.toFloat(fp.add(fp.fromFloat(projectile.x), fp.fromFloat(projectile.vx)));
  projectile.y = fp.toFloat(fp.add(fp.fromFloat(projectile.y), fp.fromFloat(projectile.vy)));
  projectile.angle = fpAtan2(fp.fromFloat(projectile.vy), fp.fromFloat(projectile.vx));
}

function canHomeTo(target: FighterState): boolean {
  return target.deadUntil <= 0 && target.invulnerableUntil <= 0;
}

export function isProjectileOutOfWorld(projectile: ProjectileState): boolean {
  if (!Number.isFinite(projectile.width)) {
    return false;
  }
  return projectile.x < 0 || projectile.x > ARENA_WIDTH || projectile.y < 0 || projectile.y > 675;
}
