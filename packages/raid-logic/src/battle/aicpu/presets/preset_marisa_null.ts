import {
  ARENA_HEIGHT_PX,
  ARENA_WIDTH_PX,
  bulletSpeedRankToPixelsPerTick,
} from "@repo/types";

import type { FighterState, PointState, ProjectileState } from "@repo/content";
import type { DodgeIntent } from "../dodger";
import type { NeutralMobState } from "@repo/types";

import type {
  CpuPreset,
  CpuPresetContext,
  CpuPresetDecision,
  CpuPresetMovementContext,
} from "./types";
import { deterministicUnit } from "./common";

const POWER_SPIKE_POINT = 100;
const PLAYER_DANGER_RADIUS = 190;
const DENSE_PLAYER_PROJECTILE_COUNT = 6;
const FARM_POINT_RADIUS = 340;
const FARM_MOB_RADIUS = 680;
const MOB_KEEP_OUT_RADIUS = 190;
const MOB_STANDOFF_RADIUS = 260;
const MOB_STRAFE_BAND = 42;
const AGGRESSIVE_RANGE = 170;
const NORMAL_RANGE = 320;
const DEFAULT_POINT_BOMB_THRESHOLD = 300;

export class MarisaNullPreset implements CpuPreset {
  readonly id = "preset_marisa_null";

  matches(self: FighterState): boolean {
    return self.primaryCharacter.id === "marisa";
  }

  getDesiredMove(ctx: CpuPresetMovementContext): DodgeIntent | undefined {
    return buildStrategicMove(ctx);
  }

  getDecision(ctx: CpuPresetContext): CpuPresetDecision {
    const { self, opponent, frame, dodgeResult } = ctx;
    const powered = self.pointCount >= POWER_SPIKE_POINT;
    const shootPressed = shouldShoot(self, ctx.intel);
    const playerProjectilePressure = countThreatsNearFighter(
      opponent,
      ctx.projectiles,
      frame,
      PLAYER_DANGER_RADIUS,
    );
    const playerPinned =
      playerProjectilePressure >= DENSE_PLAYER_PROJECTILE_COUNT;
    const aimTarget = powered
      ? selectPoweredAim(ctx, playerPinned, shootPressed)
      : (selectFarmAim(ctx) ?? predictHarassAim(ctx));
    const strategicMove = buildStrategicMove(ctx);

    return {
      shootPressed,
      bombPressed: shouldBomb(self, dodgeResult.emergencyBomb),
      reloadPressed: shouldReload(self, dodgeResult.threatCount),
      alternateHeld: false,
      aimX: aimTarget.x,
      aimY: aimTarget.y,
      strategicMove,
    };
  }

  reset(): void {
    // Stateless for now.
  }
}

export const marisaNullPreset = new MarisaNullPreset();

function buildStrategicMove(
  ctx: CpuPresetMovementContext,
): DodgeIntent {
  const { self, opponent, frame } = ctx;
  const powered = self.pointCount >= POWER_SPIKE_POINT;
  const playerProjectilePressure = countThreatsNearFighter(
    opponent,
    ctx.projectiles,
    frame,
    PLAYER_DANGER_RADIUS,
  );
  const playerPinned =
    playerProjectilePressure >= DENSE_PLAYER_PROJECTILE_COUNT;
  const baseStrategicMove = powered
    ? approachPlayer(
        self,
        opponent,
        playerPinned ? AGGRESSIVE_RANGE : NORMAL_RANGE,
      )
    : (farmMovement(ctx) ?? approachPlayer(self, opponent, NORMAL_RANGE));

  return avoidNeutralMobs(self, ctx.neutralMobs, baseStrategicMove);
}

function predictHarassAim(ctx: CpuPresetContext): {
  readonly x: number;
  readonly y: number;
} {
  const { self, opponent } = ctx;
  const vx = opponent.x - opponent.previousX;
  const vy = opponent.y - opponent.previousY;
  const bulletSpeed = Math.max(
    0.1,
    bulletSpeedRankToPixelsPerTick(self.activeCharacter.bulletSpeed),
  );
  const distance = Math.hypot(opponent.x - self.x, opponent.y - self.y);
  const travelTicks = Math.max(1, distance / bulletSpeed);
  return clampPoint({
    x: opponent.x + vx * travelTicks * 0.78,
    y: opponent.y + vy * travelTicks * 0.78,
  });
}

function predictSealAim(
  ctx: CpuPresetContext,
  playerPinned: boolean,
): { readonly x: number; readonly y: number } {
  const base = predictHarassAim(ctx);
  const escape = likelyPlayerEscapeVector(ctx);
  const selfToPlayerX = ctx.opponent.x - ctx.self.x;
  const selfToPlayerY = ctx.opponent.y - ctx.self.y;
  const dist = Math.max(1, Math.hypot(selfToPlayerX, selfToPlayerY));
  const sideX = -selfToPlayerY / dist;
  const sideY = selfToPlayerX / dist;
  const sealWeight = playerPinned ? 74 : 42;
  const sideSign = escape.x * sideX + escape.y * sideY >= 0 ? 1 : -1;

  return clampPoint({
    x: base.x + sideX * sideSign * sealWeight + escape.x * 24,
    y: base.y + sideY * sideSign * sealWeight + escape.y * 24,
  });
}

function selectPoweredAim(
  ctx: CpuPresetContext,
  playerPinned: boolean,
  shootPressed: boolean,
): { readonly x: number; readonly y: number } {
  if (shootPressed && deterministicUnit(ctx.frame, ctx.self.shotsFired) < 0.4) {
    return { x: ctx.opponent.x, y: ctx.opponent.y };
  }

  return predictSealAim(ctx, playerPinned);
}

function likelyPlayerEscapeVector(ctx: CpuPresetContext): {
  readonly x: number;
  readonly y: number;
} {
  let x = ctx.opponent.x - ctx.opponent.previousX;
  let y = ctx.opponent.y - ctx.opponent.previousY;

  for (const projectile of ctx.projectiles) {
    if (!projectileCanThreaten(ctx.opponent, projectile, ctx.frame)) continue;
    const dx = ctx.opponent.x - projectile.x;
    const dy = ctx.opponent.y - projectile.y;
    const dist = Math.hypot(dx, dy);
    if (dist <= 1 || dist > PLAYER_DANGER_RADIUS) continue;
    const weight = (PLAYER_DANGER_RADIUS - dist) / PLAYER_DANGER_RADIUS;
    x += (dx / dist) * weight * 3;
    y += (dy / dist) * weight * 3;
  }

  const len = Math.hypot(x, y);
  if (len <= 0.01) {
    const dx = ctx.opponent.x - ctx.self.x;
    const dy = ctx.opponent.y - ctx.self.y;
    const dist = Math.max(1, Math.hypot(dx, dy));
    return { x: -dy / dist, y: dx / dist };
  }

  return { x: x / len, y: y / len };
}

function selectFarmAim(
  ctx: CpuPresetContext,
): { readonly x: number; readonly y: number } | undefined {
  const mob = nearestActiveMob(ctx.self, ctx.neutralMobs, FARM_MOB_RADIUS);
  if (mob) {
    return { x: mob.x, y: mob.y };
  }
  return undefined;
}

function farmMovement(
  ctx: CpuPresetMovementContext,
): DodgeIntent | undefined {
  const point = nearestPoint(ctx.self, ctx.points, FARM_POINT_RADIUS);
  if (point) {
    return {
      ...moveToward(ctx.self, point),
      kind: "point",
      urgency: 0.88,
      bravery: 0.92,
    };
  }

  const mob = nearestActiveMob(ctx.self, ctx.neutralMobs, FARM_MOB_RADIUS);
  if (mob) {
    return {
      ...approachMobAtStandoff(ctx.self, mob),
      kind: "farm",
      urgency: 0.35,
      bravery: 0.15,
    };
  }

  return undefined;
}

function approachMobAtStandoff(
  self: FighterState,
  mob: NeutralMobState,
): DodgeIntent {
  const dx = mob.x - self.x;
  const dy = mob.y - self.y;
  const dist = Math.max(1, Math.hypot(dx, dy));
  let moveX = 0;
  let moveY = 0;

  if (dist < MOB_STANDOFF_RADIUS - MOB_STRAFE_BAND) {
    moveX -= dx / dist;
    moveY -= dy / dist;
  } else if (dist > MOB_STANDOFF_RADIUS + MOB_STRAFE_BAND) {
    moveX += dx / dist;
    moveY += dy / dist;
  } else {
    moveX += -dy / dist;
    moveY += dx / dist;
  }

  moveX += edgeAvoidance(self.x, ARENA_WIDTH_PX);
  moveY += edgeAvoidance(self.y, ARENA_HEIGHT_PX);

  return {
    moveX: sign(moveX),
    moveY: sign(moveY),
    kind: "farm",
    urgency: 0.35,
    bravery: 0.15,
  };
}

function avoidNeutralMobs(
  self: FighterState,
  mobs: readonly NeutralMobState[],
  baseMove: DodgeIntent,
): DodgeIntent {
  let moveX = baseMove.moveX;
  let moveY = baseMove.moveY;

  for (const mob of mobs) {
    if (!mob.active || mob.CurrentHealth <= 0) continue;
    const dx = self.x - mob.x;
    const dy = self.y - mob.y;
    const dist = Math.max(1, Math.hypot(dx, dy));
    if (dist >= MOB_KEEP_OUT_RADIUS) continue;

    const weight = (MOB_KEEP_OUT_RADIUS - dist) / MOB_KEEP_OUT_RADIUS;
    moveX += (dx / dist) * (2.5 + weight * 4);
    moveY += (dy / dist) * (2.5 + weight * 4);
  }

  moveX += edgeAvoidance(self.x, ARENA_WIDTH_PX);
  moveY += edgeAvoidance(self.y, ARENA_HEIGHT_PX);

  return {
    ...baseMove,
    moveX: sign(moveX),
    moveY: sign(moveY),
  };
}

function approachPlayer(
  self: FighterState,
  opponent: FighterState,
  preferredRange: number,
): DodgeIntent {
  const dx = opponent.x - self.x;
  const dy = opponent.y - self.y;
  const dist = Math.max(1, Math.hypot(dx, dy));
  const rangeError = dist - preferredRange;
  let moveX = 0;
  let moveY = 0;

  if (Math.abs(rangeError) > 34) {
    const dir = rangeError > 0 ? 1 : -1;
    moveX += (dx / dist) * dir;
    moveY += (dy / dist) * dir;
  } else {
    moveX += -dy / dist;
    moveY += dx / dist;
  }

  moveX += edgeAvoidance(self.x, ARENA_WIDTH_PX);
  moveY += edgeAvoidance(self.y, ARENA_HEIGHT_PX);

  return {
    moveX: sign(moveX),
    moveY: sign(moveY),
    kind: "attack",
    urgency: 0.55,
    bravery: 0.25,
  };
}

function shouldShoot(
  self: FighterState,
  intel: CpuPresetContext["intel"],
): boolean {
  if (!intel.canAct) return false;
  if (self.reloadRemaining > 0) return false;
  if (self.ammo <= 0) return false;
  if (self.fireCooldownUntil > 0) return false;
  if (self.actionLockedUntil > 0) return false;
  if (self.deadUntil > 0) return false;
  return true;
}

function shouldReload(self: FighterState, threatCount: number): boolean {
  if (self.reloadRemaining > 0) return false;
  if (self.ammo >= self.ammoCapacity) return false;
  if (self.actionLockedUntil > 0) return false;
  if (self.deadUntil > 0) return false;
  if (self.ammo === 0) return true;
  return self.ammo <= 1 && threatCount <= 1;
}

function shouldBomb(self: FighterState, emergencyBomb: boolean): boolean {
  if (!emergencyBomb) return false;
  if (self.bombCooldownUntil > 0) return false;
  if (self.actionLockedUntil > 0) return false;
  if (self.deadUntil > 0) return false;
  return self.bombs > 0 || self.pointCount >= DEFAULT_POINT_BOMB_THRESHOLD;
}

function nearestActiveMob(
  self: FighterState,
  mobs: readonly NeutralMobState[],
  radius: number,
): NeutralMobState | undefined {
  let best:
    | { readonly mob: NeutralMobState; readonly distSq: number }
    | undefined;
  const radiusSq = radius * radius;

  for (const mob of mobs) {
    if (!mob.active || mob.CurrentHealth <= 0) continue;
    const distSq = (mob.x - self.x) ** 2 + (mob.y - self.y) ** 2;
    if (distSq > radiusSq) continue;
    if (!best || distSq < best.distSq) {
      best = { mob, distSq };
    }
  }

  return best?.mob;
}

function nearestPoint(
  self: FighterState,
  points: readonly PointState[],
  radius: number,
): PointState | undefined {
  let best: { readonly point: PointState; readonly score: number } | undefined;
  const radiusSq = radius * radius;

  for (const point of points) {
    if (!point.active) continue;
    if (point.collectingBy && point.collectingBy !== self.key) continue;
    const distSq = (point.x - self.x) ** 2 + (point.y - self.y) ** 2;
    if (distSq > radiusSq) continue;
    const score = distSq / Math.max(1, point.value);
    if (!best || score < best.score) {
      best = { point, score };
    }
  }

  return best?.point;
}

function countThreatsNearFighter(
  fighter: FighterState,
  projectiles: readonly ProjectileState[],
  frame: number,
  radius: number,
): number {
  let count = 0;
  const radiusSq = radius * radius;

  for (const projectile of projectiles) {
    if (!projectileCanThreaten(fighter, projectile, frame)) continue;
    const distSq =
      (projectile.x - fighter.x) ** 2 + (projectile.y - fighter.y) ** 2;
    if (distSq <= radiusSq) {
      count += 1;
    }
  }

  return count;
}

function projectileCanThreaten(
  fighter: FighterState,
  projectile: ProjectileState,
  frame: number,
): boolean {
  if (projectile.owner === fighter.key) return false;
  if (projectile.damage <= 0) return false;
  if (frame < projectile.visibleFrom) return false;
  if (projectile.expireAt !== undefined && frame > projectile.expireAt)
    return false;
  if (projectile.pausedUntil > frame) return false;
  return true;
}

function moveToward(
  self: FighterState,
  target: { readonly x: number; readonly y: number },
): { readonly moveX: -1 | 0 | 1; readonly moveY: -1 | 0 | 1 } {
  return {
    moveX: sign(target.x - self.x + edgeAvoidance(self.x, ARENA_WIDTH_PX) * 80),
    moveY: sign(
      target.y - self.y + edgeAvoidance(self.y, ARENA_HEIGHT_PX) * 80,
    ),
  };
}

function edgeAvoidance(pos: number, max: number): number {
  const margin = 72;
  if (pos < margin) return (margin - pos) / margin;
  if (pos > max - margin) return (max - margin - pos) / margin;
  return 0;
}

function sign(value: number): -1 | 0 | 1 {
  if (value > 0.3) return 1;
  if (value < -0.3) return -1;
  return 0;
}

function clampPoint(point: { readonly x: number; readonly y: number }): {
  readonly x: number;
  readonly y: number;
} {
  return {
    x: Math.max(0, Math.min(ARENA_WIDTH_PX, point.x)),
    y: Math.max(0, Math.min(ARENA_HEIGHT_PX, point.y)),
  };
}
