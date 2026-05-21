import { fp } from "@shaisrc/fixed-point";

import type { ProjectileCollisionContext } from "@repo/types";

import { PLAYER_CORE_RADIUS } from "../../constants";
import type { FighterKey, FighterState, ProjectileState, ShieldState } from "@repo/content";
import type { CollisionResult } from "../physics-adapter";
import { fpHypotFp, fpClamp, fpMin, fpMax } from "@repo/content";
import { createBulletProjectile, isProjectileOutOfWorld, stepBulletProjectile } from "./bullet";
import { createLaserProjectile, stepLaserProjectile } from "./laser";

export type BulletProjectileParams = Omit<Parameters<typeof createBulletProjectile>[0], "id">;
export type LaserProjectileParams = Omit<Parameters<typeof createLaserProjectile>[0], "id">;

export class ProjectileSystem {
  private nextProjectileId = 1;

  reset(): void {
    this.nextProjectileId = 1;
  }

  getNextId(): number {
    return this.nextProjectileId;
  }

  restoreNextId(projectiles: readonly ProjectileState[], nextProjectileId?: number): void {
    const nextIdFromProjectiles = Math.max(0, ...projectiles.map((projectile) => projectile.id)) + 1;
    this.nextProjectileId = Math.max(nextProjectileId ?? nextIdFromProjectiles, nextIdFromProjectiles);
  }

  spawnBullet(
    projectiles: ProjectileState[],
    params: BulletProjectileParams,
  ): void {
    projectiles.push(createBulletProjectile({ id: this.nextProjectileId++, ...params }));
  }

  spawnLaser(
    projectiles: ProjectileState[],
    params: LaserProjectileParams,
  ): void {
    projectiles.push(createLaserProjectile({ id: this.nextProjectileId++, ...params }));
  }

  stepProjectiles(params: {
    readonly frame: number;
    readonly projectiles: ProjectileState[];
    readonly player: FighterState;
    readonly target: FighterState;
    readonly shields?: readonly ShieldState[];
    readonly onHit: (ctx: ProjectileCollisionContext<ProjectileState, FighterState, FighterKey>) => boolean;
    readonly computeRapierHits?: (projectiles: readonly ProjectileState[]) => readonly CollisionResult[] | undefined;
  }): void {
    const remaining: ProjectileState[] = [];
    for (const projectile of params.projectiles) {
      projectile.previousX = projectile.x;
      projectile.previousY = projectile.y;
      projectile.previousWidth = projectile.width;
      const paused = params.frame < projectile.pausedUntil;
      if (!paused) {
        if (projectile.kind === "laser" || projectile.kind === "spark") {
          stepLaserProjectile(projectile);
        } else {
          const target = projectile.owner === "Player1" ? params.target : params.player;
          stepBulletProjectile(projectile, params.frame, target);
        }
      }
    }

    let rapierHitMap: Map<number, FighterKey | "blocked"> | undefined;
    if (params.computeRapierHits) {
      const results = params.computeRapierHits(params.projectiles);
      if (results) {
        rapierHitMap = new Map(results.filter((r) => r.victimKey).map((r) => [r.projectileId, r.victimKey!]));
        for (const result of results) {
          if (result.blockedByShield) {
            rapierHitMap.set(result.projectileId, "blocked");
          }
        }
      }
    }

    for (const projectile of params.projectiles) {
      const victim = projectile.owner === "Player1" ? params.target : params.player;
      const visible = params.frame >= projectile.visibleFrom;
      const canInteract = visible && projectile.damage > 0;
      if (canInteract && canShieldBlockProjectile(projectile) && rapierHitMap?.get(projectile.id) === "blocked") {
        continue;
      }
      if (canInteract && isBlockedByShield(projectile, params.shields ?? [])) {
        continue;
      }
      if (canInteract) {
        const rapierVictim = rapierHitMap?.get(projectile.id);
        const isHit = rapierHitMap !== undefined && canUseRapierHitTest(projectile)
          ? rapierVictim === victim.key
          : hitTest(projectile, victim);

        if (isHit) {
          const accepted = params.onHit({
            projectile,
            owner: projectile.owner,
            victim,
            damage: projectile.damage,
          });
          if (accepted && !projectile.pierce) {
            continue;
          }
        }
      }

      const expired = projectile.expireAt !== undefined && params.frame >= projectile.expireAt;
      if (!expired && !isProjectileOutOfWorld(projectile)) {
        remaining.push(projectile);
      }
    }

    params.projectiles.splice(0, params.projectiles.length, ...remaining);
  }
}

export function clearProjectilesAround(
  projectiles: ProjectileState[],
  x: number,
  y: number,
  radius: number,
): number {
  const before = projectiles.length;
  projectiles.splice(
    0,
    projectiles.length,
    ...projectiles.filter(
      (projectile) => fp.gt(
        fpHypotFp(
          fp.sub(fp.fromFloat(projectile.x), fp.fromFloat(x)),
          fp.sub(fp.fromFloat(projectile.y), fp.fromFloat(y)),
        ),
        fp.fromFloat(radius),
      ),
    ),
  );
  return before - projectiles.length;
}

function hitTest(projectile: ProjectileState, victim: FighterState): boolean {
  if (projectile.kind === "laser" || projectile.kind === "spark") {
    if (!Number.isFinite(projectile.width)) {
      // Infinite-width beam: ray vs circle
      const fpVx = fp.fromFloat(victim.x);
      const fpVy = fp.fromFloat(victim.y);
      const fpPx = fp.fromFloat(projectile.x);
      const fpPy = fp.fromFloat(projectile.y);
      const fpDx = fp.sub(fpVx, fpPx);
      const fpDy = fp.sub(fpVy, fpPy);
      const fpAngle = fp.fromFloat(projectile.angle);
      const fpCos = fp.cos(fpAngle);
      const fpSin = fp.sin(fpAngle);
      const fpForward = fp.add(fp.mul(fpDx, fpCos), fp.mul(fpDy, fpSin));
      const fpSide = fp.abs(fp.add(fp.mul(fp.negate(fpDx), fpSin), fp.mul(fpDy, fpCos)));
      const fpHalfH = fp.div(fp.fromFloat(projectile.height), fp.fromInt(2));
      const fpRadius = fp.fromFloat(PLAYER_CORE_RADIUS);
      const fpSideMax = fp.add(fpHalfH, fpRadius);
      const fpNegRadius = fp.negate(fpRadius);
      return fp.gte(fpForward, fpNegRadius) && fp.lte(fpSide, fpSideMax);
    }
  }
  return rotatedRectIntersectsCircle(projectile, victim.x, victim.y, PLAYER_CORE_RADIUS);
}

function canUseRapierHitTest(projectile: ProjectileState): boolean {
  return Number.isFinite(projectile.width) && projectile.width > 0 && projectile.height > 0;
}

function isBlockedByShield(projectile: ProjectileState, shields: readonly ShieldState[]): boolean {
  if (!canShieldBlockProjectile(projectile)) {
    return false;
  }

  for (const shield of shields) {
    if (projectile.owner === shield.owner) {
      continue;
    }
    if (rotatedRectsIntersect(projectile, shield)) {
      return true;
    }
  }
  return false;
}

function canShieldBlockProjectile(projectile: ProjectileState): boolean {
  return (projectile.kind === "orb" || projectile.kind === "knife") && canUseRapierHitTest(projectile);
}

function rotatedRectsIntersect(projectile: ProjectileState, shield: ShieldState): boolean {
  const projectileRect = {
    x: projectile.x,
    y: projectile.y,
    halfWidth: fp.div(fp.fromFloat(projectile.width), fp.fromInt(2)),
    halfHeight: fp.div(fp.fromFloat(projectile.height), fp.fromInt(2)),
    angle: projectile.angle,
  };
  const shieldRect = {
    x: shield.x,
    y: shield.y,
    halfWidth: fp.div(fp.fromFloat(shield.width), fp.fromInt(2)),
    halfHeight: fp.div(fp.fromFloat(shield.height), fp.fromInt(2)),
    angle: shield.angle,
  };
  const axes = [
    rectAxis(projectileRect.angle, false),
    rectAxis(projectileRect.angle, true),
    rectAxis(shieldRect.angle, false),
    rectAxis(shieldRect.angle, true),
  ];
  const projectileCorners = rectCorners(projectileRect);
  const shieldCorners = rectCorners(shieldRect);

  for (const axis of axes) {
    const projectileProjection = projectCorners(projectileCorners, axis);
    const shieldProjection = projectCorners(shieldCorners, axis);
    if (fp.lt(projectileProjection.max, shieldProjection.min) || fp.lt(shieldProjection.max, projectileProjection.min)) {
      return false;
    }
  }
  return true;
}

interface RectLike {
  readonly x: number;
  readonly y: number;
  readonly halfWidth: number;
  readonly halfHeight: number;
  readonly angle: number;
}

interface Vec2 {
  readonly x: number;
  readonly y: number;
}

function rectAxis(angle: number, perpendicular: boolean): Vec2 {
  const fpAngle = fp.fromFloat(angle);
  const fpCos = fp.cos(fpAngle);
  const fpSin = fp.sin(fpAngle);
  return perpendicular
    ? { x: fp.negate(fpSin), y: fpCos }
    : { x: fpCos, y: fpSin };
}

function rectCorners(rect: RectLike): readonly Vec2[] {
  const fpX = fp.fromFloat(rect.x);
  const fpY = fp.fromFloat(rect.y);
  const forward = rectAxis(rect.angle, false);
  const side = rectAxis(rect.angle, true);
  const corners: Vec2[] = [];
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      corners.push({
        x: fp.add(fp.add(fpX, fp.mul(forward.x, fp.mul(rect.halfWidth, fp.fromInt(sx)))), fp.mul(side.x, fp.mul(rect.halfHeight, fp.fromInt(sy)))),
        y: fp.add(fp.add(fpY, fp.mul(forward.y, fp.mul(rect.halfWidth, fp.fromInt(sx)))), fp.mul(side.y, fp.mul(rect.halfHeight, fp.fromInt(sy)))),
      });
    }
  }
  return corners;
}

function projectCorners(corners: readonly Vec2[], axis: Vec2): { readonly min: number; readonly max: number } {
  let min = dot(corners[0]!, axis);
  let max = min;
  for (let index = 1; index < corners.length; index += 1) {
    const projection = dot(corners[index]!, axis);
    min = fpMin(min, projection);
    max = fpMax(max, projection);
  }
  return { min, max };
}

function dot(left: Vec2, right: Vec2): number {
  return fp.add(fp.mul(left.x, right.x), fp.mul(left.y, right.y));
}

function rotatedRectIntersectsCircle(
  projectile: ProjectileState,
  circleX: number,
  circleY: number,
  circleRadius: number,
): boolean {
  const fpCx = fp.fromFloat(circleX);
  const fpCy = fp.fromFloat(circleY);
  const fpPx = fp.fromFloat(projectile.x);
  const fpPy = fp.fromFloat(projectile.y);
  const fpDx = fp.sub(fpCx, fpPx);
  const fpDy = fp.sub(fpCy, fpPy);
  const fpAngle = fp.fromFloat(projectile.angle);
  const fpCos = fp.cos(fpAngle);
  const fpSin = fp.sin(fpAngle);

  // localX = dx * cos + dy * sin
  const fpLocalX = fp.add(fp.mul(fpDx, fpCos), fp.mul(fpDy, fpSin));
  // localY = -dx * sin + dy * cos
  const fpLocalY = fp.add(fp.mul(fp.negate(fpDx), fpSin), fp.mul(fpDy, fpCos));

  const fpHalfW = fp.div(fp.fromFloat(projectile.width), fp.fromInt(2));
  const fpHalfH = fp.div(fp.fromFloat(projectile.height), fp.fromInt(2));
  const fpClosestX = fpClamp(fpLocalX, fp.negate(fpHalfW), fpHalfW);
  const fpClosestY = fpClamp(fpLocalY, fp.negate(fpHalfH), fpHalfH);

  const fpDist = fpHypotFp(
    fp.sub(fpLocalX, fpClosestX),
    fp.sub(fpLocalY, fpClosestY),
  );
  return fp.lte(fpDist, fp.fromFloat(circleRadius));
}
