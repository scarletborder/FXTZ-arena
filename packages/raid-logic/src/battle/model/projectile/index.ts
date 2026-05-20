import { fp } from "@shaisrc/fixed-point";

import type { ProjectileCollisionContext } from "@repo/types";

import { PLAYER_CORE_RADIUS } from "../../constants";
import type { FighterKey, FighterState, ProjectileState } from "@repo/content";
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

  restoreNextId(projectiles: readonly ProjectileState[]): void {
    this.nextProjectileId = Math.max(0, ...projectiles.map((projectile) => projectile.id)) + 1;
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
          const target = projectile.owner === "player" ? params.target : params.player;
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
      if (rapierHitMap?.get(projectile.id) === "blocked") {
        continue;
      }
      const victim = projectile.owner === "player" ? params.target : params.player;
      const visible = params.frame >= projectile.visibleFrom;
      if (visible && projectile.damage > 0) {
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
