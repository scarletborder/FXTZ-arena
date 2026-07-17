import {
  ARENA_HEIGHT_PX,
  ARENA_WIDTH_PX,
  bulletSpeedRankToPixelsPerTick,
} from "@repo/types";

import type { FighterState, ProjectileState } from "@repo/types";

import type { DodgeIntent } from "../dodger";
import type { CpuPresetContext } from "./types";

const EDGE_MARGIN = 72;
const DEFAULT_POINT_BOMB_THRESHOLD = 300;
const CIRNO_POINT_BOMB_THRESHOLD = 250;

export function canShoot(
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

export function canBombAs(
  self: FighterState,
  characterId: FighterState["activeCharacter"]["id"],
): boolean {
  if (self.bombCooldownUntil > 0) return false;
  if (self.actionLockedUntil > 0) return false;
  if (self.nonFireActionLockedUntil > 0) return false;
  if (self.deadUntil > 0) return false;
  if (characterId === "reisen" && self.reisenShieldLayers > 0) return false;
  const threshold =
    characterId === "cirno"
      ? CIRNO_POINT_BOMB_THRESHOLD
      : DEFAULT_POINT_BOMB_THRESHOLD;
  return self.bombs > 0 || self.pointCount >= threshold;
}

export function shouldReload(self: FighterState, threatCount: number): boolean {
  if (self.reloadRemaining > 0) return false;
  if (self.ammo >= self.ammoCapacity) return false;
  if (self.actionLockedUntil > 0) return false;
  if (self.nonFireActionLockedUntil > 0) return false;
  if (self.deadUntil > 0) return false;
  if (self.ammo === 0) return true;
  return self.ammo <= Math.ceil(self.ammoCapacity / 2) && threatCount <= 1;
}

export function alternateHeldForDesired(
  self: FighterState,
  desiredCharacterId: FighterState["activeCharacter"]["id"],
): boolean {
  const usingAlternate = self.activeCharacter.id === self.alternateCharacter.id;
  if (!canSwitch(self)) {
    return usingAlternate;
  }
  return desiredCharacterId === self.alternateCharacter.id;
}

export function canSwitch(self: FighterState): boolean {
  return (
    self.actionLockedUntil <= 0 &&
    self.nonFireActionLockedUntil <= 0 &&
    self.switchLockedUntil <= 0 &&
    self.reisenShieldLayers <= 0
  );
}

export function canBombAfterSwitch(
  self: FighterState,
  desiredCharacterId: FighterState["activeCharacter"]["id"],
): boolean {
  if (self.activeCharacter.id === desiredCharacterId) {
    return canBombAs(self, desiredCharacterId);
  }
  return canSwitch(self) && canBombAs(self, desiredCharacterId);
}

export function predictiveAim(ctx: {
  readonly self: FighterState;
  readonly opponent: FighterState;
}): { readonly x: number; readonly y: number } {
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
    x: opponent.x + vx * travelTicks * 0.68,
    y: opponent.y + vy * travelTicks * 0.68,
  });
}

export function approachPlayer(
  self: FighterState,
  opponent: FighterState,
  preferredRange: number,
  bravery: number,
): DodgeIntent {
  const dx = opponent.x - self.x;
  const dy = opponent.y - self.y;
  const dist = Math.max(1, Math.hypot(dx, dy));
  const rangeError = dist - preferredRange;
  let moveX = 0;
  let moveY = 0;

  if (Math.abs(rangeError) > 30) {
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
    urgency: 0.62,
    bravery,
  };
}

export function countThreatsNearFighter(
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

export function projectileCanThreaten(
  fighter: FighterState,
  projectile: ProjectileState,
  frame: number,
): boolean {
  if (projectile.owner === fighter.key) return false;
  if (projectile.damage <= 0) return false;
  if (frame < projectile.visibleFrom) return false;
  if (projectile.expireAt !== undefined && frame > projectile.expireAt) {
    return false;
  }
  if (projectile.pausedUntil > frame) return false;
  return true;
}

export function distanceBetween(
  a: { readonly x: number; readonly y: number },
  b: { readonly x: number; readonly y: number },
): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function deterministicUnit(...values: readonly number[]): number {
  let hash = 0x811c9dc5;
  for (const value of values) {
    hash ^= Math.trunc(value) & 0xff;
    hash = Math.imul(hash, 0x01000193) >>> 0;
    hash ^= (Math.trunc(value) >>> 8) & 0xff;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash / 0x100000000;
}

export function clampPoint(point: { readonly x: number; readonly y: number }): {
  readonly x: number;
  readonly y: number;
} {
  return {
    x: Math.max(0, Math.min(ARENA_WIDTH_PX, point.x)),
    y: Math.max(0, Math.min(ARENA_HEIGHT_PX, point.y)),
  };
}

function edgeAvoidance(pos: number, max: number): number {
  if (pos < EDGE_MARGIN) return (EDGE_MARGIN - pos) / EDGE_MARGIN;
  if (pos > max - EDGE_MARGIN) return (max - EDGE_MARGIN - pos) / EDGE_MARGIN;
  return 0;
}

function sign(value: number): -1 | 0 | 1 {
  if (value > 0.3) return 1;
  if (value < -0.3) return -1;
  return 0;
}
