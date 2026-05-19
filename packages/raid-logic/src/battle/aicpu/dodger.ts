import { speedRankToPixelsPerTick } from "@repo/types";

import { ARENA_HEIGHT_PX, ARENA_WIDTH_PX, PLAYER_CORE_RADIUS } from "../constants";
import type { FighterState, ProjectileState } from "../types";
import type { IntelligenceResult } from "./intelligence";

const WALL_MARGIN = 48;
const THREAT_CONE = Math.PI / 4;
const SAFETY_FACTOR = 4;
const MAX_THREAT_DIST = 460;
const HOMING_DANGER_BONUS = 1.8;

const LOCAL_SCAN_RADIUS = 360;
const LOCAL_SCAN_RADIUS_LASER = 560;
const PLAN_INTERVAL_TICKS = 4;
const LOOKAHEAD_TICKS = 8;
const MAX_LOCAL_PROJECTILES = 20;
const MOVE_STAY_PENALTY = 1.75;
const SOFT_WALL_MARGIN = 140;
const WALL_PRESSURE_WEIGHT = 8;
const CORNER_PRESSURE_WEIGHT = 10;

const MOVES: ReadonlyArray<{ readonly x: -1 | 0 | 1; readonly y: -1 | 0 | 1 }> = [
  { x: 0, y: 0 },
  { x: 1, y: 0 },
  { x: -1, y: 0 },
  { x: 0, y: 1 },
  { x: 0, y: -1 },
  { x: 1, y: 1 },
  { x: 1, y: -1 },
  { x: -1, y: 1 },
  { x: -1, y: -1 },
];

export interface DodgeResult {
  readonly moveX: -1 | 0 | 1;
  readonly moveY: -1 | 0 | 1;
  readonly threatCount: number;
  readonly emergencyBomb: boolean;
}

interface Threat {
  danger: number;
  escapeX: number;
  escapeY: number;
}

interface ProjectedProjectile {
  readonly kind: ProjectileState["kind"];
  readonly x: number;
  readonly y: number;
  readonly vx: number;
  readonly vy: number;
  readonly width: number;
  readonly height: number;
  readonly angle: number;
  readonly damage: number;
}

interface ProjectionDanger {
  readonly risk: number;
  readonly collisions: number;
  readonly threats: number;
  readonly minClearance: number;
}

export class Dodger {
  private prevEscapeX = 0;
  private prevEscapeY = 0;
  private cachedPlan: DodgeResult | null = null;
  private nextPlanFrame = 0;

  getDodgeMovement(
    self: FighterState,
    opponent: FighterState,
    projectiles: readonly ProjectileState[],
    frame: number,
    intel: IntelligenceResult,
  ): DodgeResult {
    // 延迟反应：用滞后的帧号评估弹幕，模拟反应延迟
    const delayedFrame = Math.max(0, frame - intel.reactionDelay);

    if (this.cachedPlan && frame < this.nextPlanFrame) {
      return this.cachedPlan;
    }

    const nearbyProjectiles = this.collectNearbyProjectiles(self, projectiles, delayedFrame);
    if (nearbyProjectiles.length === 0) {
      this.cachedPlan = {
        moveX: 0,
        moveY: 0,
        threatCount: 0,
        emergencyBomb: false,
      };
      this.nextPlanFrame = frame + PLAN_INTERVAL_TICKS;
      return this.cachedPlan;
    }

    const threats = this.evaluateThreats(self, nearbyProjectiles, delayedFrame);
    const plan = this.planLocalDodge(self, opponent, nearbyProjectiles, threats, delayedFrame, intel);
    this.cachedPlan = plan;
    this.nextPlanFrame = frame + PLAN_INTERVAL_TICKS;
    this.prevEscapeX = plan.moveX;
    this.prevEscapeY = plan.moveY;
    return plan;
  }

  getStrategicMovement(
    self: FighterState,
    opponent: FighterState,
  ): { moveX: -1 | 0 | 1; moveY: -1 | 0 | 1 } {
    const dx = opponent.x - self.x;
    const dy = opponent.y - self.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 0.01) {
      return { moveX: 0, moveY: 0 };
    }

    let targetX = 0;
    let targetY = 0;

    if (dist < 150) {
      targetX = -dx / dist;
      targetY = -dy / dist;
    } else if (dist > 400) {
      targetX = dx / dist;
      targetY = dy / dist;
    } else {
      targetX = -dy / dist;
      targetY = dx / dist;
    }

    targetX += this.wallAvoidance(self.x, WALL_MARGIN, ARENA_WIDTH_PX);
    targetY += this.wallAvoidance(self.y, WALL_MARGIN, ARENA_HEIGHT_PX);

    return {
      moveX: this.sign(targetX) as -1 | 0 | 1,
      moveY: this.sign(targetY) as -1 | 0 | 1,
    };
  }

  reset(): void {
    this.prevEscapeX = 0;
    this.prevEscapeY = 0;
    this.cachedPlan = null;
    this.nextPlanFrame = 0;
  }

  private planLocalDodge(
    self: FighterState,
    opponent: FighterState,
    projectiles: readonly ProjectileState[],
    threats: readonly Threat[],
    frame: number,
    intel: IntelligenceResult,
  ): DodgeResult {
    const speed = self.movementLockedUntil > 0 ? 0 : speedRankToPixelsPerTick(self.moveSpeedOverride ?? self.activeCharacter.moveSpeed);
    let best: {
      moveX: -1 | 0 | 1;
      moveY: -1 | 0 | 1;
      score: number;
      emergencyBomb: boolean;
      threatCount: number;
    } | null = null;

    for (const move of MOVES) {
      const candidate = this.scoreMove(self, opponent, projectiles, threats, frame, speed, move, intel);
      if (!best) {
        best = candidate;
      } else if (intel.crashIntoBullet) {
        if (candidate.score > best.score) {
          best = candidate;
        }
      } else if (candidate.score < best.score) {
        best = candidate;
      }
    }

    if (!best) {
      return {
        moveX: 0,
        moveY: 0,
        threatCount: 0,
        emergencyBomb: false,
      };
    }

    return {
      moveX: best.moveX,
      moveY: best.moveY,
      threatCount: best.threatCount,
      emergencyBomb: best.emergencyBomb,
    };
  }

  private scoreMove(
    self: FighterState,
    opponent: FighterState,
    projectiles: readonly ProjectileState[],
    threats: readonly Threat[],
    frame: number,
    speed: number,
    move: { readonly x: -1 | 0 | 1; readonly y: -1 | 0 | 1 },
    intel: IntelligenceResult,
  ): {
    readonly moveX: -1 | 0 | 1;
    readonly moveY: -1 | 0 | 1;
    readonly score: number;
    readonly emergencyBomb: boolean;
    readonly threatCount: number;
  } {
    let x = self.x;
    let y = self.y;
    let score = 0;
    let emergencyBomb = false;
    let worstThreats = threats.length;
    let minClearance = Number.POSITIVE_INFINITY;

    for (let tick = 1; tick <= LOOKAHEAD_TICKS; tick += 1) {
      x = clamp(x + move.x * speed, 48, ARENA_WIDTH_PX - 48);
      y = clamp(y + move.y * speed, 48, ARENA_HEIGHT_PX - 48);

      const danger = this.evaluateProjectionDanger(x, y, projectiles, frame, tick);
      score += danger.risk * (1 + tick * 0.15) * intel.dodgeAccuracy;
      score += this.wallPressure(x, y) * (danger.collisions > 0 ? 0.2 : 1);
      worstThreats = Math.max(worstThreats, danger.threats);
      minClearance = Math.min(minClearance, danger.minClearance);

      if (danger.collisions > 0) {
        emergencyBomb = true;
        score += 1000 * (LOOKAHEAD_TICKS - tick + 1) * intel.dodgeAccuracy;
      }
    }

    if (move.x === 0 && move.y === 0) {
      score += MOVE_STAY_PENALTY * Math.max(1, threats.length);
    }

    const dx = opponent.x - self.x;
    const dy = opponent.y - self.y;
    const dist = Math.hypot(dx, dy);
    if (dist > 0.01 && intel.dodgeAccuracy > 0.5) {
      const awayX = -dx / dist;
      const awayY = -dy / dist;
      const alignment = move.x * awayX + move.y * awayY;
      score -= alignment * 0.25;
    }

    if (Math.abs(this.prevEscapeX - move.x) + Math.abs(this.prevEscapeY - move.y) < 0.5) {
      score -= 0.12;
    }

    if (minClearance < 8) {
      score += (8 - minClearance) * 40 * intel.dodgeAccuracy;
    }

    return {
      moveX: move.x,
      moveY: move.y,
      score,
      emergencyBomb,
      threatCount: Math.max(1, worstThreats),
    };
  }

  private collectNearbyProjectiles(
    self: FighterState,
    projectiles: readonly ProjectileState[],
    frame: number,
  ): ProjectileState[] {
    const nearby: ProjectileState[] = [];
    const localRadiusSq = LOCAL_SCAN_RADIUS * LOCAL_SCAN_RADIUS;
    const laserRadiusSq = LOCAL_SCAN_RADIUS_LASER * LOCAL_SCAN_RADIUS_LASER;

    for (const projectile of projectiles) {
      if (projectile.owner === "target") continue;
      if (projectile.damage <= 0) continue;
      if (frame < projectile.visibleFrom) continue;
      if (projectile.pausedUntil > frame) continue;

      const dx = projectile.x - self.x;
      const dy = projectile.y - self.y;
      const distSq = dx * dx + dy * dy;

      if (projectile.kind === "laser" || projectile.kind === "spark") {
        const forward = dx * Math.cos(projectile.angle) + dy * Math.sin(projectile.angle);
        const side = Math.abs(-dx * Math.sin(projectile.angle) + dy * Math.cos(projectile.angle));
        if (distSq <= laserRadiusSq || (side <= LOCAL_SCAN_RADIUS_LASER && forward >= -PLAYER_CORE_RADIUS)) {
          nearby.push(projectile);
        }
        continue;
      }

      const travelReach = Math.hypot(projectile.vx, projectile.vy) * LOOKAHEAD_TICKS;
      const scanRadius = LOCAL_SCAN_RADIUS + travelReach;
      if (distSq <= scanRadius * scanRadius || distSq <= localRadiusSq) {
        nearby.push(projectile);
      }
    }

    if (nearby.length <= MAX_LOCAL_PROJECTILES) {
      return nearby;
    }

    return nearby
      .map((projectile) => ({
        projectile,
        distSq: (projectile.x - self.x) ** 2 + (projectile.y - self.y) ** 2,
      }))
      .sort((a, b) => a.distSq - b.distSq)
      .slice(0, MAX_LOCAL_PROJECTILES)
      .map((entry) => entry.projectile);
  }

  private evaluateThreats(
    self: FighterState,
    projectiles: readonly ProjectileState[],
    frame: number,
  ): Threat[] {
    const threats: Threat[] = [];

    for (const projectile of projectiles) {
      const px = projectile.x;
      const py = projectile.y;

      const dx = self.x - px;
      const dy = self.y - py;
      const dist = Math.hypot(dx, dy);
      if (dist > MAX_THREAT_DIST) continue;

      if (projectile.kind === "laser" || projectile.kind === "spark") {
        const threat = this.evaluateLaserThreat(projectile, dx, dy);
        if (threat) threats.push(threat);
      } else {
        const threat = this.evaluateBulletThreat(projectile, dx, dy, dist, frame);
        if (threat) threats.push(threat);
      }
    }

    return threats;
  }

  private evaluateProjectionDanger(
    x: number,
    y: number,
    projectiles: readonly ProjectileState[],
    frame: number,
    tick: number,
  ): ProjectionDanger {
    let risk = 0;
    let collisions = 0;
    let threats = 0;
    let minClearance = Number.POSITIVE_INFINITY;

    for (const projectile of projectiles) {
      const futureFrame = frame + tick - 1;
      if (futureFrame < projectile.visibleFrom) continue;
      if (projectile.expireAt !== undefined && futureFrame > projectile.expireAt) continue;

      const predicted = this.predictProjectile(projectile, frame, tick, x, y);
      const danger = this.projectileDangerAt(predicted, x, y);
      minClearance = Math.min(minClearance, danger.clearance);
      if (danger.risk <= 0) continue;

      threats += 1;
      if (danger.collides) collisions += 1;

      const timeWeight = 1 + (LOOKAHEAD_TICKS - tick) / LOOKAHEAD_TICKS;
      risk += danger.risk * timeWeight * Math.max(1, projectile.damage);
    }

    return { risk, collisions, threats, minClearance };
  }

  private predictProjectile(
    projectile: ProjectileState,
    frame: number,
    tick: number,
    targetX: number,
    targetY: number,
  ): ProjectedProjectile {
    let x = projectile.x;
    let y = projectile.y;
    let vx = projectile.vx;
    let vy = projectile.vy;
    let width = projectile.width;
    let angle = projectile.angle;

    for (let i = 0; i < tick; i += 1) {
      const stepFrame = frame + i;
      if (stepFrame < projectile.pausedUntil) {
        continue;
      }

      if (projectile.kind === "laser" || projectile.kind === "spark") {
        if (projectile.widthGrowthPerTick > 0) {
          width = Math.min(projectile.maxWidth ?? Number.POSITIVE_INFINITY, width + projectile.widthGrowthPerTick);
        }
        if (projectile.anchorX !== undefined && projectile.anchorY !== undefined && Number.isFinite(width)) {
          x = projectile.anchorX + Math.cos(angle) * (width / 2);
          y = projectile.anchorY + Math.sin(angle) * (width / 2);
        }
        x += vx;
        y += vy;
        continue;
      }

      if (projectile.kind === "orb" && stepFrame >= projectile.homingStartAt && stepFrame <= projectile.homingUntil) {
        const dx = targetX - x;
        const dy = targetY - y;
        const length = Math.max(1, Math.hypot(dx, dy));
        const speed = Math.max(1.5, Math.hypot(vx, vy));
        vx = vx * 0.9 + (dx / length) * speed * 0.1;
        vy = vy * 0.9 + (dy / length) * speed * 0.1;
      }

      x += vx;
      y += vy;
      angle = Math.atan2(vy, vx);
    }

    return {
      kind: projectile.kind,
      x,
      y,
      vx,
      vy,
      width,
      height: projectile.height,
      angle,
      damage: projectile.damage,
    };
  }

  private projectileDangerAt(projectile: ProjectedProjectile, x: number, y: number): {
    readonly risk: number;
    readonly collides: boolean;
    readonly clearance: number;
  } {
    const clearance = Number.isFinite(projectile.width)
      ? this.distanceToRotatedRect(projectile, x, y) - PLAYER_CORE_RADIUS
      : this.distanceToRay(projectile, x, y) - PLAYER_CORE_RADIUS;
    const collides = clearance <= 1.25;
    const speed = Math.hypot(projectile.vx, projectile.vy);
    const safetyBand = 18 + speed * 1.4;

    if (collides) {
      return {
        risk: 1000 + Math.max(0, -clearance) * 20,
        collides: true,
        clearance,
      };
    }

    if (clearance >= safetyBand) {
      return { risk: 0, collides: false, clearance };
    }

    const proximity = (safetyBand - clearance) / safetyBand;
    return {
      risk: proximity * proximity * 18 * Math.max(1, projectile.damage),
      collides: false,
      clearance,
    };
  }

  private distanceToRotatedRect(projectile: ProjectedProjectile, x: number, y: number): number {
    const dx = x - projectile.x;
    const dy = y - projectile.y;
    const localX = dx * Math.cos(projectile.angle) + dy * Math.sin(projectile.angle);
    const localY = -dx * Math.sin(projectile.angle) + dy * Math.cos(projectile.angle);
    const closestX = clamp(localX, -projectile.width / 2, projectile.width / 2);
    const closestY = clamp(localY, -projectile.height / 2, projectile.height / 2);
    return Math.hypot(localX - closestX, localY - closestY);
  }

  private distanceToRay(projectile: ProjectedProjectile, x: number, y: number): number {
    const dx = x - projectile.x;
    const dy = y - projectile.y;
    const forward = dx * Math.cos(projectile.angle) + dy * Math.sin(projectile.angle);
    const side = Math.abs(-dx * Math.sin(projectile.angle) + dy * Math.cos(projectile.angle));
    if (forward >= 0) {
      return Math.max(0, side - projectile.height / 2);
    }
    return Math.hypot(forward, Math.max(0, side - projectile.height / 2));
  }

  private evaluateLaserThreat(
    projectile: ProjectileState,
    dx: number,
    dy: number,
  ): Threat | null {
    const angle = projectile.angle;
    const forward = dx * Math.cos(angle) + dy * Math.sin(angle);
    const side = Math.abs(-dx * Math.sin(angle) + dy * Math.cos(angle));
    const threatRadius = projectile.height / 2 + PLAYER_CORE_RADIUS * SAFETY_FACTOR;

    if (side > threatRadius) return null;
    if (forward < -PLAYER_CORE_RADIUS) return null;

    const closestDist = Math.max(0, side - projectile.height / 2);
    const danger = Math.max(0.1, (threatRadius - closestDist) / threatRadius);

    return {
      danger,
      escapeX: -Math.sin(angle),
      escapeY: Math.cos(angle),
    };
  }

  private evaluateBulletThreat(
    projectile: ProjectileState,
    dx: number,
    dy: number,
    dist: number,
    frame: number,
  ): Threat | null {
    const angle = projectile.angle;
    const speed = Math.max(0.1, Math.hypot(projectile.vx, projectile.vy));

    const toCpuAngle = Math.atan2(dy, dx);
    let angleDiff = toCpuAngle - angle;
    angleDiff = ((angleDiff + Math.PI) % (Math.PI * 2)) - Math.PI;
    if (Math.abs(angleDiff) > THREAT_CONE) return null;

    const forward = dx * Math.cos(angle) + dy * Math.sin(angle);
    if (forward < 0) return null;

    const side = Math.abs(-dx * Math.sin(angle) + dy * Math.cos(angle));
    const threatRadius = projectile.height / 2 + PLAYER_CORE_RADIUS * SAFETY_FACTOR;
    if (side > threatRadius) return null;

    const isHoming = projectile.kind === "orb" && frame >= projectile.homingStartAt && frame <= projectile.homingUntil;
    let timeToClosest = forward / speed;
    if (isHoming) {
      timeToClosest = Math.min(timeToClosest, dist / (speed * 1.2));
    }
    if (timeToClosest < 0) return null;

    let danger = Math.max(0.05, (threatRadius - side) / threatRadius / Math.max(1, timeToClosest / 15));
    if (isHoming) {
      danger *= HOMING_DANGER_BONUS;
    }

    let escapeX: number;
    let escapeY: number;
    if (isHoming) {
      const orbToCpuAngle = Math.atan2(-dy, -dx);
      escapeX = -Math.sin(orbToCpuAngle);
      escapeY = Math.cos(orbToCpuAngle);
    } else if (side < PLAYER_CORE_RADIUS * 2) {
      escapeX = -Math.sin(angle);
      escapeY = Math.cos(angle);
    } else {
      const sideSign = Math.sign(-dx * Math.sin(angle) + dy * Math.cos(angle));
      escapeX = Math.sin(angle) * sideSign;
      escapeY = -Math.cos(angle) * sideSign;
    }

    const escapeLen = Math.hypot(escapeX, escapeY);
    if (escapeLen > 0.01) {
      escapeX /= escapeLen;
      escapeY /= escapeLen;
    }

    return { danger, escapeX, escapeY };
  }

  private wallAvoidance(pos: number, margin: number, max: number): number {
    if (pos < margin) return (margin - pos) / margin;
    if (pos > max - margin) return (max - margin - pos) / margin;
    return 0;
  }

  private wallPressure(x: number, y: number): number {
    const left = this.edgePressure(x - 48);
    const right = this.edgePressure(ARENA_WIDTH_PX - 48 - x);
    const top = this.edgePressure(y - 48);
    const bottom = this.edgePressure(ARENA_HEIGHT_PX - 48 - y);
    const horizontal = Math.max(left, right);
    const vertical = Math.max(top, bottom);
    const edgePressure = left * left + right * right + top * top + bottom * bottom;
    const cornerPressure = horizontal * vertical;
    return edgePressure * WALL_PRESSURE_WEIGHT + cornerPressure * CORNER_PRESSURE_WEIGHT;
  }

  private edgePressure(distanceToWall: number): number {
    if (distanceToWall >= SOFT_WALL_MARGIN) return 0;
    return (SOFT_WALL_MARGIN - distanceToWall) / SOFT_WALL_MARGIN;
  }

  private sign(value: number): number {
    if (value > 0.3) return 1;
    if (value < -0.3) return -1;
    return 0;
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
