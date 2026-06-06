import { ARENA_HEIGHT_PX, ARENA_WIDTH_PX, speedRankToPixelsPerTick } from "@repo/types";
import type { FighterState, ProjectileState } from "@repo/content";

import {
  LOCAL_SCAN_RADIUS,
  LOCAL_SCAN_RADIUS_LASER,
  MAX_LOCAL_PROJECTILES,
} from "./constants";
import { projectileCanThreaten } from "./projectile-prediction";
import { strategicMovement } from "./strategic";
import { chooseVelocityObstacleMove } from "./velocity-obstacle";
import type { DodgeIntent, DodgeResult, MoveOption } from "./types";
import type { IntelligenceResult } from "../intelligence";

export class Dodger {
  private previousMove: MoveOption = { x: 0, y: 0 };

  getDodgeMovement(
    self: FighterState,
    opponent: FighterState,
    projectiles: readonly ProjectileState[],
    frame: number,
    intel: IntelligenceResult,
    desiredMoveOverride?: DodgeIntent,
  ): DodgeResult {
    const nearbyProjectiles = collectNearbyProjectiles(self, projectiles, frame);
    if (nearbyProjectiles.length === 0) {
      this.previousMove = { x: 0, y: 0 };
      return {
        moveX: 0,
        moveY: 0,
        threatCount: 0,
        emergencyBomb: false,
      };
    }

    const speed = self.movementLockedUntil > 0
      ? 0
      : speedRankToPixelsPerTick(self.moveSpeedOverride ?? self.activeCharacter.moveSpeed);
    const desiredMove = desiredMoveOverride ?? toDodgeIntent(strategicMovement(self, opponent));
    const result = chooseVelocityObstacleMove({
      self,
      opponent,
      projectiles: nearbyProjectiles,
      frame,
      speed,
      desiredMove,
      previousMove: this.previousMove,
      ignoreDodge: intel.ignoreDodge,
    });

    this.previousMove = { x: result.moveX, y: result.moveY };
    return result;
  }

  getStrategicMovement(
    self: FighterState,
    opponent: FighterState,
  ): { moveX: -1 | 0 | 1; moveY: -1 | 0 | 1 } {
    const move = strategicMovement(self, opponent);
    return { moveX: move.x, moveY: move.y };
  }

  reset(): void {
    this.previousMove = { x: 0, y: 0 };
  }
}

export type { DodgeIntent, DodgeResult };

function toDodgeIntent(move: MoveOption): DodgeIntent {
  return {
    moveX: move.x,
    moveY: move.y,
    kind: "position",
  };
}

function collectNearbyProjectiles(
  self: FighterState,
  projectiles: readonly ProjectileState[],
  frame: number,
): ProjectileState[] {
  const nearby: ProjectileState[] = [];
  const localRadiusSq = LOCAL_SCAN_RADIUS * LOCAL_SCAN_RADIUS;

  for (const projectile of projectiles) {
    if (!projectileCanThreaten(projectile, self, frame)) continue;

    if (projectile.kind === "laser" || projectile.kind === "spark") {
      if (laserCouldReachSelf(projectile, self)) {
        nearby.push(projectile);
      }
      continue;
    }

    const dx = projectile.x - self.x;
    const dy = projectile.y - self.y;
    const travelReach = Math.hypot(projectile.vx, projectile.vy) * 36;
    const scanRadius = LOCAL_SCAN_RADIUS + travelReach;
    if (dx * dx + dy * dy <= Math.max(localRadiusSq, scanRadius * scanRadius)) {
      nearby.push(projectile);
    }
  }

  if (nearby.length <= MAX_LOCAL_PROJECTILES) {
    return nearby;
  }

  return nearby
    .map((projectile) => ({
      projectile,
      score: projectilePriority(self, projectile),
    }))
    .sort((left, right) => left.score - right.score)
    .slice(0, MAX_LOCAL_PROJECTILES)
    .map((entry) => entry.projectile);
}

function projectilePriority(self: FighterState, projectile: ProjectileState): number {
  const dx = projectile.x - self.x;
  const dy = projectile.y - self.y;
  const speed = Math.max(0.001, Math.hypot(projectile.vx, projectile.vy));
  const forward = -((dx * projectile.vx + dy * projectile.vy) / speed);
  return dx * dx + dy * dy - Math.max(0, forward) * 80;
}

function laserCouldReachSelf(projectile: ProjectileState, self: FighterState): boolean {
  const dx = self.x - projectile.x;
  const dy = self.y - projectile.y;
  const cos = Math.cos(projectile.angle);
  const sin = Math.sin(projectile.angle);
  const forward = dx * cos + dy * sin;
  const side = Math.abs(-dx * sin + dy * cos);
  if (side <= LOCAL_SCAN_RADIUS_LASER) return true;
  if (!Number.isFinite(projectile.width)) return forward > -48 && side < ARENA_WIDTH_PX + ARENA_HEIGHT_PX;
  return Math.hypot(dx, dy) <= LOCAL_SCAN_RADIUS_LASER + Math.max(projectile.width, projectile.height);
}
