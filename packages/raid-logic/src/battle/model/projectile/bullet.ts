import { ARENA_WIDTH, bulletSpeedRankToPixelsPerTick, secondsToTicks } from "@repo/types";

import type { FighterKey, FighterState, ProjectileState } from "../../types";

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
}): ProjectileState {
  const speed = bulletSpeedRankToPixelsPerTick(params.speedRank);
  const spawnOffset = params.spawnOffset ?? 28;
  return {
    id: params.id,
    kind: params.kind,
    owner: params.owner,
    x: params.x + Math.cos(params.angle) * spawnOffset,
    y: params.y + Math.sin(params.angle) * spawnOffset,
    previousX: params.x + Math.cos(params.angle) * spawnOffset,
    previousY: params.y + Math.sin(params.angle) * spawnOffset,
    vx: Math.cos(params.angle) * speed,
    vy: Math.sin(params.angle) * speed,
    width: params.width,
    previousWidth: params.width,
    height: params.height,
    anchorX: undefined,
    anchorY: undefined,
    visibleFrom: params.frame,
    expireAt: undefined,
    homingStartAt: params.frame + HOMING_START_DELAY_TICKS,
    homingUntil: params.frame + HOMING_START_DELAY_TICKS + params.homingTicks,
    pausedUntil: params.frame,
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
      projectile.x += projectile.vx;
      projectile.y += projectile.vy;
      projectile.angle = Math.atan2(projectile.vy, projectile.vx);
      return;
    }
    const dx = target.x - projectile.x;
    const dy = target.y - projectile.y;
    const length = Math.max(1, Math.hypot(dx, dy));
    const speed = Math.max(1.5, Math.hypot(projectile.vx, projectile.vy));
    projectile.vx = projectile.vx * 0.9 + (dx / length) * speed * 0.1;
    projectile.vy = projectile.vy * 0.9 + (dy / length) * speed * 0.1;
  }

  projectile.x += projectile.vx;
  projectile.y += projectile.vy;
  projectile.angle = Math.atan2(projectile.vy, projectile.vx);
}

function canHomeTo(target: FighterState): boolean {
  return target.lives > 0 && target.deadUntil <= 0 && target.invulnerableUntil <= 0;
}

export function isProjectileOutOfWorld(projectile: ProjectileState): boolean {
  if (!Number.isFinite(projectile.width)) {
    return false;
  }
  return projectile.x < 0 || projectile.x > ARENA_WIDTH || projectile.y < 0 || projectile.y > 675;
}
