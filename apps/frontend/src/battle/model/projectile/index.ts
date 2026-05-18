import { HIT_CIRCLE_DIAMETER } from "@repo/types";

import type { FighterKey, FighterState, ProjectileState } from "../../types";
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

      const victim = projectile.owner === "player" ? params.target : params.player;
      const visible = params.frame >= projectile.visibleFrom;
      if (visible && projectile.damage > 0 && hitTest(projectile, victim)) {
        const accepted = params.onHit(projectile.owner, victim, projectile.damage);
        if (accepted && !projectile.pierce) {
          continue;
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
    const dx = victim.x - projectile.x;
    const dy = victim.y - projectile.y;
    const forward = dx * Math.cos(projectile.angle) + dy * Math.sin(projectile.angle);
    const side = Math.abs(-dx * Math.sin(projectile.angle) + dy * Math.cos(projectile.angle));
    if (!Number.isFinite(projectile.width)) {
      return forward >= 0 && side <= projectile.height / 2 + HIT_CIRCLE_DIAMETER;
    }
    return Math.abs(forward) <= projectile.width / 2 && side <= projectile.height / 2 + HIT_CIRCLE_DIAMETER;
  }
  const hitRadius = HIT_CIRCLE_DIAMETER * 6;
  return Math.hypot(projectile.x - victim.x, projectile.y - victim.y) <= hitRadius;
}
