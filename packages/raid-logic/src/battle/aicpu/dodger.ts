import { fp } from "@shaisrc/fixed-point";

import { speedRankToPixelsPerTick } from "@repo/types";

import { ARENA_HEIGHT_PX, ARENA_WIDTH_PX, PLAYER_CORE_RADIUS } from "../constants";
import type { FighterState, ProjectileState } from "@repo/content";
import type { IntelligenceResult } from "./intelligence";
import { fpAtan2, fpClamp, fpHypot, fpHypotFp, fpMax, fpMin } from "@repo/content";

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
const FP_48 = 3145728; // fp.fromInt(48)
const FP_SOFT_WALL_MARGIN = 9175040; // fp.fromInt(140)

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
    const fpDx = fp.sub(fp.fromFloat(opponent.x), fp.fromFloat(self.x));
    const fpDy = fp.sub(fp.fromFloat(opponent.y), fp.fromFloat(self.y));
    const fpDist = fpHypotFp(fpDx, fpDy);

    if (fp.lt(fpDist, fp.fromFloat(0.01))) {
      return { moveX: 0, moveY: 0 };
    }

    let targetX = 0;
    let targetY = 0;

    if (fp.lt(fpDist, fp.fromInt(150))) {
      targetX = fp.toFloat(fp.div(fp.negate(fpDx), fpDist));
      targetY = fp.toFloat(fp.div(fp.negate(fpDy), fpDist));
    } else if (fp.gt(fpDist, fp.fromInt(400))) {
      targetX = fp.toFloat(fp.div(fpDx, fpDist));
      targetY = fp.toFloat(fp.div(fpDy, fpDist));
    } else {
      targetX = fp.toFloat(fp.div(fp.negate(fpDy), fpDist));
      targetY = fp.toFloat(fp.div(fpDx, fpDist));
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
    const speed = self.movementLockedUntil > 0
      ? 0
      : speedRankToPixelsPerTick(self.moveSpeedOverride ?? self.activeCharacter.moveSpeed);
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
    let fpX = fp.fromFloat(self.x);
    let fpY = fp.fromFloat(self.y);
    let fpScore = fp.fromInt(0);
    let emergencyBomb = false;
    let worstThreats = threats.length;
    let minClearance = Number.POSITIVE_INFINITY;

    const fpSpeed = fp.fromFloat(speed);

    for (let tick = 1; tick <= LOOKAHEAD_TICKS; tick += 1) {
      fpX = fpClamp(
        fp.add(fpX, fp.mul(fp.fromInt(move.x), fpSpeed)),
        FP_48,
        fp.fromInt(ARENA_WIDTH_PX - 48),
      );
      fpY = fpClamp(
        fp.add(fpY, fp.mul(fp.fromInt(move.y), fpSpeed)),
        FP_48,
        fp.fromInt(ARENA_HEIGHT_PX - 48),
      );

      const danger = this.evaluateProjectionDanger(
        fp.toFloat(fpX),
        fp.toFloat(fpY),
        projectiles,
        frame,
        tick,
      );

      const fpTickWeight = fp.add(fp.fromInt(1), fp.mul(fp.fromInt(tick), fp.fromFloat(0.15)));
      fpScore = fp.add(fpScore, fp.mul(fp.mul(fp.fromFloat(danger.risk), fpTickWeight), fp.fromFloat(intel.dodgeAccuracy)));

      const fpWallPressure = this.wallPressureFp(fpX, fpY);
      fpScore = fp.add(fpScore, fp.mul(fpWallPressure, fp.fromFloat(danger.collisions > 0 ? 0.2 : 1)));

      worstThreats = Math.max(worstThreats, danger.threats);
      minClearance = Math.min(minClearance, danger.minClearance);

      if (danger.collisions > 0) {
        emergencyBomb = true;
        fpScore = fp.add(
          fpScore,
          fp.mul(
            fp.fromInt(1000 * (LOOKAHEAD_TICKS - tick + 1)),
            fp.fromFloat(intel.dodgeAccuracy),
          ),
        );
      }
    }

    if (move.x === 0 && move.y === 0) {
      fpScore = fp.add(
        fpScore,
        fp.mul(fp.fromFloat(MOVE_STAY_PENALTY), fp.fromInt(Math.max(1, threats.length))),
      );
    }

    const fpDx = fp.sub(fp.fromFloat(opponent.x), fp.fromFloat(self.x));
    const fpDy = fp.sub(fp.fromFloat(opponent.y), fp.fromFloat(self.y));
    const dist = fpHypot(fpDx, fpDy);

    if (dist > 0.01 && intel.dodgeAccuracy > 0.5) {
      const fpDist = fp.fromFloat(dist);
      const fpAwayX = fp.div(fp.negate(fpDx), fpDist);
      const fpAwayY = fp.div(fp.negate(fpDy), fpDist);
      const fpAlignment = fp.add(
        fp.mul(fp.fromInt(move.x), fpAwayX),
        fp.mul(fp.fromInt(move.y), fpAwayY),
      );
      fpScore = fp.sub(fpScore, fp.mul(fpAlignment, fp.fromFloat(0.25)));
    }

    if (Math.abs(this.prevEscapeX - move.x) + Math.abs(this.prevEscapeY - move.y) < 0.5) {
      fpScore = fp.sub(fpScore, fp.fromFloat(0.12));
    }

    if (minClearance < 8) {
      fpScore = fp.add(
        fpScore,
        fp.mul(
          fp.mul(fp.sub(fp.fromInt(8), fp.fromFloat(minClearance)), fp.fromInt(40)),
          fp.fromFloat(intel.dodgeAccuracy),
        ),
      );
    }

    return {
      moveX: move.x,
      moveY: move.y,
      score: fp.toFloat(fpScore),
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
    const fpLocalRadiusSq = fp.fromInt(LOCAL_SCAN_RADIUS * LOCAL_SCAN_RADIUS);
    const fpLaserRadiusSq = fp.fromInt(LOCAL_SCAN_RADIUS_LASER * LOCAL_SCAN_RADIUS_LASER);

    for (const projectile of projectiles) {
      if (projectile.owner === "Player2") continue;
      if (projectile.damage <= 0) continue;
      if (frame < projectile.visibleFrom) continue;
      if (projectile.pausedUntil > frame) continue;

      const fpDx = fp.sub(fp.fromFloat(projectile.x), fp.fromFloat(self.x));
      const fpDy = fp.sub(fp.fromFloat(projectile.y), fp.fromFloat(self.y));
      const fpDistSq = fp.add(fp.mul(fpDx, fpDx), fp.mul(fpDy, fpDy));

      if (projectile.kind === "laser" || projectile.kind === "spark") {
        const fpAngle = fp.fromFloat(projectile.angle);
        const fpCos = fp.cos(fpAngle);
        const fpSin = fp.sin(fpAngle);
        const fpForward = fp.add(fp.mul(fpDx, fpCos), fp.mul(fpDy, fpSin));
        const fpSide = fp.abs(fp.add(fp.mul(fp.negate(fpDx), fpSin), fp.mul(fpDy, fpCos)));

        if (fp.lte(fpDistSq, fpLaserRadiusSq) ||
            (fp.lte(fpSide, fp.fromInt(LOCAL_SCAN_RADIUS_LASER)) && fp.gte(fpForward, fp.negate(fp.fromFloat(PLAYER_CORE_RADIUS))))) {
          nearby.push(projectile);
        }
        continue;
      }

      const fpTravelReach = fp.mul(
        fpHypotFp(fp.fromFloat(projectile.vx), fp.fromFloat(projectile.vy)),
        fp.fromInt(LOOKAHEAD_TICKS),
      );
      const fpScanRadius = fp.add(fp.fromInt(LOCAL_SCAN_RADIUS), fpTravelReach);

      if (fp.lte(fpDistSq, fp.mul(fpScanRadius, fpScanRadius)) || fp.lte(fpDistSq, fpLocalRadiusSq)) {
        nearby.push(projectile);
      }
    }

    if (nearby.length <= MAX_LOCAL_PROJECTILES) {
      return nearby;
    }

    return nearby
      .map((proj) => ({
        projectile: proj,
        distSq: (proj.x - self.x) ** 2 + (proj.y - self.y) ** 2,
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
    const fpMaxDist = fp.fromInt(MAX_THREAT_DIST);

    for (const projectile of projectiles) {
      const fpDx = fp.sub(fp.fromFloat(self.x), fp.fromFloat(projectile.x));
      const fpDy = fp.sub(fp.fromFloat(self.y), fp.fromFloat(projectile.y));
      const fpDist = fpHypotFp(fpDx, fpDy);

      if (fp.gt(fpDist, fpMaxDist)) continue;

      if (projectile.kind === "laser" || projectile.kind === "spark") {
        const threat = this.evaluateLaserThreat(projectile, fpDx, fpDy);
        if (threat) threats.push(threat);
      } else {
        const threat = this.evaluateBulletThreat(projectile, fpDx, fpDy, fpDist, frame);
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

      const fpTimeWeight = fp.fromFloat(1 + (LOOKAHEAD_TICKS - tick) / LOOKAHEAD_TICKS);
      risk += fp.toFloat(fp.mul(fp.mul(fp.fromFloat(danger.risk), fpTimeWeight), fp.fromInt(Math.max(1, projectile.damage))));
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
    let fpX = fp.fromFloat(projectile.x);
    let fpY = fp.fromFloat(projectile.y);
    let fpVx = fp.fromFloat(projectile.vx);
    let fpVy = fp.fromFloat(projectile.vy);
    const fpWidthFinite = Number.isFinite(projectile.width);
    let fpWidth = fpWidthFinite ? fp.fromFloat(projectile.width) : fp.fromInt(0);
    let fpAngle = fp.fromFloat(projectile.angle);

    for (let i = 0; i < tick; i += 1) {
      const stepFrame = frame + i;
      if (stepFrame < projectile.pausedUntil) {
        continue;
      }

      if (projectile.kind === "laser" || projectile.kind === "spark") {
        if (projectile.widthGrowthPerTick > 0) {
          const fpMaxW = projectile.maxWidth !== undefined && Number.isFinite(projectile.maxWidth)
            ? fp.fromFloat(projectile.maxWidth)
            : fp.fromInt(9999);
          fpWidth = fpMin(
            fpMaxW,
            fp.add(fpWidth, fp.fromFloat(projectile.widthGrowthPerTick)),
          );
        }
        if (projectile.anchorX !== undefined && projectile.anchorY !== undefined && Number.isFinite(projectile.width)) {
          const fpAnchorX = fp.fromFloat(projectile.anchorX);
          const fpAnchorY = fp.fromFloat(projectile.anchorY);
          const fpHalfW = fp.div(fpWidth, fp.fromInt(2));
          fpX = fp.add(fpAnchorX, fp.mul(fp.cos(fpAngle), fpHalfW));
          fpY = fp.add(fpAnchorY, fp.mul(fp.sin(fpAngle), fpHalfW));
        }
        fpX = fp.add(fpX, fpVx);
        fpY = fp.add(fpY, fpVy);
        continue;
      }

      if (projectile.kind === "orb" && stepFrame >= projectile.homingStartAt && stepFrame <= projectile.homingUntil) {
        const fpDx = fp.sub(fp.fromFloat(targetX), fpX);
        const fpDy = fp.sub(fp.fromFloat(targetY), fpY);
        const fpLen = fpMax(fp.fromInt(1), fpHypotFp(fpDx, fpDy));
        const fpSpd = fpMax(fp.fromFloat(1.5), fpHypotFp(fpVx, fpVy));
        fpVx = fp.add(fp.mul(fpVx, fp.fromFloat(0.9)), fp.mul(fp.mul(fp.div(fpDx, fpLen), fpSpd), fp.fromFloat(0.1)));
        fpVy = fp.add(fp.mul(fpVy, fp.fromFloat(0.9)), fp.mul(fp.mul(fp.div(fpDy, fpLen), fpSpd), fp.fromFloat(0.1)));
      }

      fpX = fp.add(fpX, fpVx);
      fpY = fp.add(fpY, fpVy);
      fpAngle = fp.fromFloat(fpAtan2(fpVy, fpVx));
    }

    return {
      kind: projectile.kind,
      x: fp.toFloat(fpX),
      y: fp.toFloat(fpY),
      vx: fp.toFloat(fpVx),
      vy: fp.toFloat(fpVy),
      width: fpWidthFinite ? fp.toFloat(fpWidth) : projectile.width,
      height: projectile.height,
      angle: fp.toFloat(fpAngle),
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

    const fpClearance = fp.fromFloat(clearance);
    const collides = fp.lte(fpClearance, fp.fromFloat(1.25));

    if (collides) {
      return {
        risk: fp.toFloat(fp.add(fp.fromInt(1000), fp.mul(fpMax(fp.fromInt(0), fp.negate(fpClearance)), fp.fromInt(20)))),
        collides: true,
        clearance,
      };
    }

    const fpSpeed = fpHypotFp(fp.fromFloat(projectile.vx), fp.fromFloat(projectile.vy));
    const fpSafetyBand = fp.add(fp.fromInt(18), fp.mul(fpSpeed, fp.fromFloat(1.4)));

    if (fp.gte(fpClearance, fpSafetyBand)) {
      return { risk: 0, collides: false, clearance };
    }

    const fpProximity = fp.div(fp.sub(fpSafetyBand, fpClearance), fpSafetyBand);
    const risk = fp.toFloat(
      fp.mul(
        fp.mul(fp.mul(fpProximity, fpProximity), fp.fromInt(18)),
        fp.fromInt(Math.max(1, projectile.damage)),
      ),
    );
    return { risk, collides: false, clearance };
  }

  private distanceToRotatedRect(projectile: ProjectedProjectile, x: number, y: number): number {
    const fpDx = fp.sub(fp.fromFloat(x), fp.fromFloat(projectile.x));
    const fpDy = fp.sub(fp.fromFloat(y), fp.fromFloat(projectile.y));
    const fpAngle = fp.fromFloat(projectile.angle);
    const fpCos = fp.cos(fpAngle);
    const fpSin = fp.sin(fpAngle);

    const fpLocalX = fp.add(fp.mul(fpDx, fpCos), fp.mul(fpDy, fpSin));
    const fpLocalY = fp.add(fp.mul(fp.negate(fpDx), fpSin), fp.mul(fpDy, fpCos));

    const fpHalfW = fp.div(fp.fromFloat(projectile.width), fp.fromInt(2));
    const fpHalfH = fp.div(fp.fromFloat(projectile.height), fp.fromInt(2));
    const fpClosestX = fpClamp(fpLocalX, fp.negate(fpHalfW), fpHalfW);
    const fpClosestY = fpClamp(fpLocalY, fp.negate(fpHalfH), fpHalfH);

    return fpHypot(fp.sub(fpLocalX, fpClosestX), fp.sub(fpLocalY, fpClosestY));
  }

  private distanceToRay(projectile: ProjectedProjectile, x: number, y: number): number {
    const fpDx = fp.sub(fp.fromFloat(x), fp.fromFloat(projectile.x));
    const fpDy = fp.sub(fp.fromFloat(y), fp.fromFloat(projectile.y));
    const fpAngle = fp.fromFloat(projectile.angle);
    const fpCos = fp.cos(fpAngle);
    const fpSin = fp.sin(fpAngle);
    const fpForward = fp.add(fp.mul(fpDx, fpCos), fp.mul(fpDy, fpSin));
    const fpSide = fp.abs(fp.add(fp.mul(fp.negate(fpDx), fpSin), fp.mul(fpDy, fpCos)));
    const fpHalfH = fp.div(fp.fromFloat(projectile.height), fp.fromInt(2));

    if (fp.gte(fpForward, fp.fromInt(0))) {
      return fp.toFloat(fpMax(fp.fromInt(0), fp.sub(fpSide, fpHalfH)));
    }
    return fpHypot(fpForward, fpMax(fp.fromInt(0), fp.sub(fpSide, fpHalfH)));
  }

  private evaluateLaserThreat(
    projectile: ProjectileState,
    fpDx: number,
    fpDy: number,
  ): Threat | null {
    const fpAngle = fp.fromFloat(projectile.angle);
    const fpCos = fp.cos(fpAngle);
    const fpSin = fp.sin(fpAngle);
    const fpForward = fp.add(fp.mul(fpDx, fpCos), fp.mul(fpDy, fpSin));
    const fpSide = fp.abs(fp.add(fp.mul(fp.negate(fpDx), fpSin), fp.mul(fpDy, fpCos)));
    const fpThreatRadius = fp.add(
      fp.div(fp.fromFloat(projectile.height), fp.fromInt(2)),
      fp.fromFloat(PLAYER_CORE_RADIUS * SAFETY_FACTOR),
    );

    if (fp.gt(fpSide, fpThreatRadius)) return null;
    if (fp.lt(fpForward, fp.negate(fp.fromFloat(PLAYER_CORE_RADIUS)))) return null;

    const fpClosestDist = fpMax(fp.fromInt(0), fp.sub(fpSide, fp.div(fp.fromFloat(projectile.height), fp.fromInt(2))));
    const fpDanger = fpMax(fp.fromFloat(0.1), fp.div(fp.sub(fpThreatRadius, fpClosestDist), fpThreatRadius));

    return {
      danger: fp.toFloat(fpDanger),
      escapeX: fp.toFloat(fp.negate(fpSin)),
      escapeY: fp.toFloat(fpCos),
    };
  }

  private evaluateBulletThreat(
    projectile: ProjectileState,
    fpDx: number,
    fpDy: number,
    fpDist: number,
    frame: number,
  ): Threat | null {
    const fpAngle = fp.fromFloat(projectile.angle);
    const fpVx = fp.fromFloat(projectile.vx);
    const fpVy = fp.fromFloat(projectile.vy);
    const fpSpeed = fpMax(fp.fromFloat(0.1), fpHypotFp(fpVx, fpVy));

    const fpToCpuAngle = fp.fromFloat(fpAtan2(fpDy, fpDx));
    let fpAngleDiff = fp.sub(fpToCpuAngle, fpAngle);
    const fpTwoPI = fp.mul(fp.fromFloat(Math.PI), fp.fromInt(2));
    const fpPI = fp.fromFloat(Math.PI);
    fpAngleDiff = fp.sub(fp.mod(fp.add(fpAngleDiff, fpPI), fpTwoPI), fpPI);

    if (fp.gt(fp.abs(fpAngleDiff), fp.fromFloat(THREAT_CONE))) return null;

    const fpCos = fp.cos(fpAngle);
    const fpSin = fp.sin(fpAngle);
    const fpForward = fp.add(fp.mul(fpDx, fpCos), fp.mul(fpDy, fpSin));
    if (fp.lt(fpForward, fp.fromInt(0))) return null;

    const fpSide = fp.abs(fp.add(fp.mul(fp.negate(fpDx), fpSin), fp.mul(fpDy, fpCos)));
    const fpThreatRadius = fp.add(
      fp.div(fp.fromFloat(projectile.height), fp.fromInt(2)),
      fp.fromFloat(PLAYER_CORE_RADIUS * SAFETY_FACTOR),
    );
    if (fp.gt(fpSide, fpThreatRadius)) return null;

    const isHoming = projectile.kind === "orb" && frame >= projectile.homingStartAt && frame <= projectile.homingUntil;

    let fpTimeToClosest = fp.div(fpForward, fpSpeed);
    if (isHoming) {
      fpTimeToClosest = fpMin(fpTimeToClosest, fp.div(fpDist, fp.mul(fpSpeed, fp.fromFloat(1.2))));
    }
    if (fp.lt(fpTimeToClosest, fp.fromInt(0))) return null;

    const fpDanger = fpMax(
      fp.fromFloat(0.05),
      fp.div(
        fp.div(fp.sub(fpThreatRadius, fpSide), fpThreatRadius),
        fpMax(fp.fromInt(1), fp.div(fpTimeToClosest, fp.fromInt(15))),
      ),
    );

    let danger = fp.toFloat(fpDanger);
    if (isHoming) {
      danger *= HOMING_DANGER_BONUS;
    }

    let fpEscapeX: number;
    let fpEscapeY: number;
    if (isHoming) {
      const fpOrbToCpuAngle = fp.fromFloat(fpAtan2(fp.negate(fpDy), fp.negate(fpDx)));
      fpEscapeX = fp.negate(fp.sin(fpOrbToCpuAngle));
      fpEscapeY = fp.cos(fpOrbToCpuAngle);
    } else if (fp.lt(fpSide, fp.fromFloat(PLAYER_CORE_RADIUS * 2))) {
      fpEscapeX = fp.negate(fpSin);
      fpEscapeY = fpCos;
    } else {
      const fpCross = fp.add(fp.mul(fp.negate(fpDx), fpSin), fp.mul(fpDy, fpCos));
      const fpSideSign = fp.gte(fpCross, fp.fromInt(0)) ? fp.fromInt(1) : fp.negate(fp.fromInt(1));
      fpEscapeX = fp.mul(fpSin, fpSideSign);
      fpEscapeY = fp.mul(fp.negate(fpCos), fpSideSign);
    }

    const fpEscapeLen = fpHypotFp(fpEscapeX, fpEscapeY);
    if (fp.gt(fpEscapeLen, fp.fromFloat(0.01))) {
      fpEscapeX = fp.div(fpEscapeX, fpEscapeLen);
      fpEscapeY = fp.div(fpEscapeY, fpEscapeLen);
    }

    return {
      danger,
      escapeX: fp.toFloat(fpEscapeX),
      escapeY: fp.toFloat(fpEscapeY),
    };
  }

  private wallAvoidance(pos: number, margin: number, max: number): number {
    if (pos < margin) return (margin - pos) / margin;
    if (pos > max - margin) return (max - margin - pos) / margin;
    return 0;
  }

  private wallPressureFp(fpX: number, fpY: number): number {
    const fpLeft = this.edgePressureFp(fp.sub(fpX, FP_48));
    const fpRight = this.edgePressureFp(fp.sub(fp.fromInt(ARENA_WIDTH_PX - 48), fpX));
    const fpTop = this.edgePressureFp(fp.sub(fpY, FP_48));
    const fpBottom = this.edgePressureFp(fp.sub(fp.fromInt(ARENA_HEIGHT_PX - 48), fpY));

    const fpHorizontal = fpMax(fpLeft, fpRight);
    const fpVertical = fpMax(fpTop, fpBottom);

    const fpEdgePressure = fp.add(
      fp.add(fp.mul(fpLeft, fpLeft), fp.mul(fpRight, fpRight)),
      fp.add(fp.mul(fpTop, fpTop), fp.mul(fpBottom, fpBottom)),
    );
    const fpCornerPressure = fp.mul(fpHorizontal, fpVertical);

    return fp.add(
      fp.mul(fpEdgePressure, fp.fromInt(WALL_PRESSURE_WEIGHT)),
      fp.mul(fpCornerPressure, fp.fromInt(CORNER_PRESSURE_WEIGHT)),
    );
  }

  private edgePressureFp(fpDist: number): number {
    if (fp.gte(fpDist, FP_SOFT_WALL_MARGIN)) return fp.fromInt(0);
    return fp.div(fp.sub(FP_SOFT_WALL_MARGIN, fpDist), FP_SOFT_WALL_MARGIN);
  }

  private sign(value: number): number {
    if (value > 0.3) return 1;
    if (value < -0.3) return -1;
    return 0;
  }
}
