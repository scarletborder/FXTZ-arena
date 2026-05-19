import { PLAYER_CORE_RADIUS } from "../../constants";
import type { FighterKey, FighterState, ProjectileState } from "../../types";
import type { CollisionResult } from "../physics-adapter";
import { createBulletProjectile, isProjectileOutOfWorld, stepBulletProjectile } from "./bullet";
import { createLaserProjectile, stepLaserProjectile } from "./laser";

type BulletProjectileParams = Omit<Parameters<typeof createBulletProjectile>[0], "id">;
type LaserProjectileParams = Omit<Parameters<typeof createLaserProjectile>[0], "id">;

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
    readonly onHit: (owner: FighterKey, victim: FighterState, damage: number) => boolean;
    /**
     * Optional callback invoked AFTER projectile positions have been updated
     * but BEFORE hit-testing. Receives the projectiles with their new
     * positions and should return any Rapier-driven collision results.
     * Return `undefined` to use the built-in manual hitTest for all projectiles.
     */
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

    // Compute Rapier hit results after position updates, if callback provided.
    let rapierHitMap: Map<number, FighterKey> | undefined;
    if (params.computeRapierHits) {
      const results = params.computeRapierHits(params.projectiles);
      if (results) {
        rapierHitMap = new Map(results.map((r) => [r.projectileId, r.victimKey]));
      }
    }

    for (const projectile of params.projectiles) {
      const victim = projectile.owner === "player" ? params.target : params.player;
      const visible = params.frame >= projectile.visibleFrom;
      if (visible && projectile.damage > 0) {
        // Use Rapier hit results if available; fall back to manual hitTest.
        const rapierVictim = rapierHitMap?.get(projectile.id);
        const isHit = rapierVictim !== undefined
          ? rapierVictim === victim.key
          : hitTest(projectile, victim);

        if (isHit) {
          const accepted = params.onHit(projectile.owner, victim, projectile.damage);
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
): void {
  projectiles.splice(
    0,
    projectiles.length,
    ...projectiles.filter((projectile) => Math.hypot(projectile.x - x, projectile.y - y) > radius),
  );
}

function hitTest(projectile: ProjectileState, victim: FighterState): boolean {
  if (projectile.kind === "laser" || projectile.kind === "spark") {
    if (!Number.isFinite(projectile.width)) {
      const dx = victim.x - projectile.x;
      const dy = victim.y - projectile.y;
      const forward = dx * Math.cos(projectile.angle) + dy * Math.sin(projectile.angle);
      const side = Math.abs(-dx * Math.sin(projectile.angle) + dy * Math.cos(projectile.angle));
      return forward >= -PLAYER_CORE_RADIUS && side <= projectile.height / 2 + PLAYER_CORE_RADIUS;
    }
  }
  return rotatedRectIntersectsCircle(projectile, victim.x, victim.y, PLAYER_CORE_RADIUS);
}

function rotatedRectIntersectsCircle(
  projectile: ProjectileState,
  circleX: number,
  circleY: number,
  circleRadius: number,
): boolean {
  const dx = circleX - projectile.x;
  const dy = circleY - projectile.y;
  const localX = dx * Math.cos(projectile.angle) + dy * Math.sin(projectile.angle);
  const localY = -dx * Math.sin(projectile.angle) + dy * Math.cos(projectile.angle);
  const closestX = clamp(localX, -projectile.width / 2, projectile.width / 2);
  const closestY = clamp(localY, -projectile.height / 2, projectile.height / 2);
  return Math.hypot(localX - closestX, localY - closestY) <= circleRadius;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
