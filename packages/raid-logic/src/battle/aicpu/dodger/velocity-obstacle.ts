import { ARENA_HEIGHT_PX, ARENA_WIDTH_PX } from "@repo/types";
import type { FighterState, ProjectileState } from "@repo/types";

import {
  EMERGENCY_BOMB_LOOKAHEAD_TICKS,
  MOVE_STAY_PENALTY,
  MOVES,
  PREVIOUS_MOVE_BONUS,
  VELOCITY_OBSTACLE_HORIZON_TICKS,
  WALL_MARGIN,
} from "./constants";
import {
  projectileCollisionProbe,
  projectileIsThreatening,
  sweptProjectileBody,
} from "./body-collision";
import { projectProjectile } from "./projectile-prediction";
import type {
  CandidateScore,
  DodgeIntent,
  DodgeResult,
  MoveOption,
} from "./types";

export function chooseVelocityObstacleMove(params: {
  readonly self: FighterState;
  readonly opponent: FighterState;
  readonly projectiles: readonly ProjectileState[];
  readonly frame: number;
  readonly speed: number;
  readonly desiredMove: DodgeIntent;
  readonly previousMove: MoveOption;
  readonly ignoreDodge: boolean;
}): DodgeResult {
  const scores = MOVES.map((move) => scoreCandidate(params, move));
  const safeScores = scores.filter(
    (score) => score.collisionTick === undefined,
  );
  const pool = safeScores.length > 0 ? safeScores : scores;
  let best = pool[0]!;

  for (const score of pool) {
    if (score.score < best.score) {
      best = score;
    }
  }

  if (params.ignoreDodge && !allMovesCollideImmediately(scores)) {
    return {
      moveX: 0,
      moveY: 0,
      threatCount: Math.max(1, best.threatCount),
      emergencyBomb: false,
    };
  }

  return {
    moveX: best.move.x,
    moveY: best.move.y,
    threatCount: Math.max(1, best.threatCount),
    emergencyBomb: allMovesCollideImmediately(scores),
  };
}

function scoreCandidate(
  params: {
    readonly self: FighterState;
    readonly opponent: FighterState;
    readonly projectiles: readonly ProjectileState[];
    readonly frame: number;
    readonly speed: number;
    readonly desiredMove: DodgeIntent;
    readonly previousMove: MoveOption;
  },
  move: MoveOption,
): CandidateScore {
  const vx = move.x * params.speed;
  const vy = move.y * params.speed;
  let score = wallScore(params.self.x + vx, params.self.y + vy);
  let threatCount = 0;
  let collisionTick: number | undefined;
  let minClearance = Number.POSITIVE_INFINITY;
  const bravery = pointBravery(params.desiredMove);
  const riskScale = lerp(1, 0.16, bravery);

  for (const projectile of params.projectiles) {
    const probe = probeCandidateAgainstProjectile(
      params.self,
      projectile,
      params.frame,
      vx,
      vy,
    );
    minClearance = Math.min(minClearance, probe.minClearance);
    if (probe.threatening) {
      threatCount += 1;
    }
    if (probe.collisionTick !== undefined) {
      collisionTick =
        collisionTick === undefined
          ? probe.collisionTick
          : Math.min(collisionTick, probe.collisionTick);
      score += 120_000 / Math.max(1, probe.collisionTick);
    } else {
      score += probe.risk * riskScale;
    }
  }

  score += intentScore(params.self, params.opponent, move, params.desiredMove);
  if (move.x === 0 && move.y === 0) {
    score += MOVE_STAY_PENALTY;
  }
  if (move.x === params.previousMove.x && move.y === params.previousMove.y) {
    score -= PREVIOUS_MOVE_BONUS;
  }
  const clearanceFloor = lerp(8, 3.5, bravery);
  const clearanceWeight = lerp(65, 18, bravery);
  if (minClearance < clearanceFloor) {
    score += (clearanceFloor - minClearance) * clearanceWeight;
  }

  return { move, score, threatCount, collisionTick };
}

function probeCandidateAgainstProjectile(
  self: FighterState,
  projectile: ProjectileState,
  frame: number,
  selfVx: number,
  selfVy: number,
): {
  readonly collisionTick: number | undefined;
  readonly minClearance: number;
  readonly threatening: boolean;
  readonly risk: number;
} {
  let collisionTick: number | undefined;
  let minClearance = Number.POSITIVE_INFINITY;
  let threatening = false;

  const speed = Math.max(
    0.001,
    Math.hypot(projectile.vx - selfVx, projectile.vy - selfVy),
  );
  const coarseStep = speed > 18 ? 1 : speed > 9 ? 2 : 3;

  for (
    let tick = 1;
    tick <= VELOCITY_OBSTACLE_HORIZON_TICKS;
    tick += coarseStep
  ) {
    const selfX = self.x + selfVx * tick;
    const selfY = self.y + selfVy * tick;
    const projected = sweptProjectileBody(
      projectProjectile(projectile, frame, tick, self),
    );
    const probe = projectileCollisionProbe(
      projected,
      selfX,
      selfY,
      self.hitCircleRadiusMultiplier,
    );

    minClearance = Math.min(minClearance, probe.clearance);
    if (projectileIsThreatening(probe.clearance)) {
      threatening = true;
    }
    if (probe.collides) {
      collisionTick = tick;
      break;
    }
  }

  if (collisionTick === undefined && coarseStep > 1 && minClearance < 18) {
    for (
      let tick = 1;
      tick <= Math.min(VELOCITY_OBSTACLE_HORIZON_TICKS, 12);
      tick += 1
    ) {
      const selfX = self.x + selfVx * tick;
      const selfY = self.y + selfVy * tick;
      const projected = sweptProjectileBody(
        projectProjectile(projectile, frame, tick, self),
      );
      const probe = projectileCollisionProbe(
        projected,
        selfX,
        selfY,
        self.hitCircleRadiusMultiplier,
      );
      minClearance = Math.min(minClearance, probe.clearance);
      if (probe.collides) {
        collisionTick = tick;
        break;
      }
    }
  }

  const risk = minClearance <= 0 ? 10_000 : 400 / Math.max(1, minClearance);
  return { collisionTick, minClearance, threatening, risk };
}

function allMovesCollideImmediately(
  scores: readonly CandidateScore[],
): boolean {
  return scores.every(
    (score) =>
      score.collisionTick !== undefined &&
      score.collisionTick <= EMERGENCY_BOMB_LOOKAHEAD_TICKS,
  );
}

function intentScore(
  self: FighterState,
  opponent: FighterState,
  move: MoveOption,
  desiredMove: DodgeIntent,
): number {
  let score = 0;
  const urgency = clamp01(desiredMove.urgency ?? 0);
  const bravery = pointBravery(desiredMove);
  const intentWeight = 8 + urgency * 8 + bravery * 18;
  score -=
    (move.x * desiredMove.moveX + move.y * desiredMove.moveY) * intentWeight;

  const nextX = self.x + move.x * 5;
  const nextY = self.y + move.y * 5;
  const dist = Math.hypot(opponent.x - nextX, opponent.y - nextY);
  if (dist < 120) score += (120 - dist) * 0.03;
  if (dist > 520) score += (dist - 520) * 0.015;
  return score;
}

function pointBravery(intent: DodgeIntent): number {
  if (intent.kind !== "point") return 0;
  return clamp01(intent.bravery ?? 0.72);
}

function lerp(from: number, to: number, t: number): number {
  return from + (to - from) * clamp01(t);
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function wallScore(x: number, y: number): number {
  return (
    Math.abs(edgePressure(x, ARENA_WIDTH_PX)) * 18 +
    Math.abs(edgePressure(y, ARENA_HEIGHT_PX)) * 18
  );
}

function edgePressure(pos: number, max: number): number {
  if (pos < WALL_MARGIN) return (WALL_MARGIN - pos) / WALL_MARGIN;
  if (pos > max - WALL_MARGIN) return (max - WALL_MARGIN - pos) / WALL_MARGIN;
  return 0;
}
