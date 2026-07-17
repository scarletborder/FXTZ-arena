import { fp } from "@shaisrc/fixed-point";

import { bulletSpeedRankToPixelsPerTick, secondsToTicks } from "@repo/types";

import type { FighterState } from "@repo/types";
import type { IntelligenceResult } from "./intelligence";
import { fpHypotFp, fpMax } from "@repo/content";

const BOMB_THREAT_THRESHOLD = 3;
const SWITCH_COOLDOWN_TICKS = secondsToTicks(1.5);
const PROACTIVE_SWITCH_INTERVAL = secondsToTicks(10);
const MIN_SHOTS_BEFORE_SWITCH = 2;

export interface StrategyAction {
  readonly shootPressed: boolean;
  readonly bombPressed: boolean;
  readonly reloadPressed: boolean;
  readonly alternateHeld: boolean;
  readonly aimX: number;
  readonly aimY: number;
}

export class StrategyManager {
  private switchCooldown = 0;
  private switchTimer = 0;
  private shotsSinceSwitch = 0;

  getActions(
    frame: number,
    self: FighterState,
    opponent: FighterState,
    threatCount: number,
    emergencyBomb: boolean,
    intel: IntelligenceResult,
  ): StrategyAction {
    if (this.switchCooldown > 0) {
      this.switchCooldown -= 1;
    }
    this.switchTimer += 1;

    const alternateHeld = this.decideCharacter(self);
    const shootPressed = this.shouldShoot(frame, self, intel);
    const reloadPressed = this.shouldReload(self, threatCount, intel);
    const bombPressed = this.shouldBomb(self, threatCount, emergencyBomb);

    if (shootPressed) {
      this.shotsSinceSwitch += 1;
    }

    const { aimX, aimY } = this.predictiveAim(self, opponent);

    return {
      shootPressed,
      bombPressed,
      reloadPressed,
      alternateHeld,
      aimX,
      aimY,
    };
  }

  reset(): void {
    this.switchCooldown = 0;
    this.switchTimer = 0;
    this.shotsSinceSwitch = 0;
  }

  private decideCharacter(self: FighterState): boolean {
    if (this.switchCooldown > 0) {
      return self.activeCharacter.id === self.alternateCharacter.id;
    }

    const usingAlternate =
      self.activeCharacter.id === self.alternateCharacter.id;
    const currentAmmo = self.ammo;
    const primaryAmmo =
      self.ammoByCharacterId[self.primaryCharacter.id] ??
      self.primaryCharacter.ammoCapacity;
    const alternateAmmo =
      self.ammoByCharacterId[self.alternateCharacter.id] ??
      self.alternateCharacter.ammoCapacity;
    const otherAmmo = usingAlternate ? primaryAmmo : alternateAmmo;

    if (currentAmmo <= 0 && otherAmmo > 0) {
      return this.commitSwitch(usingAlternate);
    }

    if (this.switchTimer >= PROACTIVE_SWITCH_INTERVAL) {
      if (this.shotsSinceSwitch >= MIN_SHOTS_BEFORE_SWITCH && otherAmmo > 0) {
        return this.commitSwitch(usingAlternate);
      }
    }

    return usingAlternate;
  }

  private commitSwitch(usingAlternate: boolean): boolean {
    this.switchCooldown = SWITCH_COOLDOWN_TICKS;
    this.switchTimer = 0;
    this.shotsSinceSwitch = 0;
    return !usingAlternate;
  }

  private predictiveAim(
    self: FighterState,
    opponent: FighterState,
  ): { aimX: number; aimY: number } {
    const playerVx = opponent.x - opponent.previousX;
    const playerVy = opponent.y - opponent.previousY;

    const bulletSpeed = bulletSpeedRankToPixelsPerTick(
      self.activeCharacter.bulletSpeed,
    );

    const fpDx = fp.fromFloat(opponent.x - self.x);
    const fpDy = fp.fromFloat(opponent.y - self.y);
    const fpDist = fpHypotFp(fpDx, fpDy);

    const bulletSpeedFp = fp.fromFloat(bulletSpeed);
    const fpTravelTime = fpMax(
      fp.fromInt(1),
      fp.div(fpDist, fpMax(bulletSpeedFp, fp.fromFloat(0.1))),
    );

    const leadFactor = fp.fromFloat(0.6);
    const fpAimX = fp.add(
      fp.fromFloat(opponent.x),
      fp.mul(fp.mul(fp.fromFloat(playerVx), fpTravelTime), leadFactor),
    );
    const fpAimY = fp.add(
      fp.fromFloat(opponent.y),
      fp.mul(fp.mul(fp.fromFloat(playerVy), fpTravelTime), leadFactor),
    );

    return { aimX: fp.toFloat(fpAimX), aimY: fp.toFloat(fpAimY) };
  }

  private shouldShoot(
    frame: number,
    self: FighterState,
    intel: IntelligenceResult,
  ): boolean {
    if (self.reloadRemaining > 0) return false;
    if (self.ammo <= 0) return false;
    if (self.fireCooldownUntil > 0) return false;
    if (self.actionLockedUntil > 0) return false;
    if (self.deadUntil > 0) return false;

    if (
      intel.dullingProgress > 0.5 &&
      deterministicUnit(frame, this.switchTimer, self.shotsFired) <
        intel.dullingProgress * 0.3
    ) {
      return false;
    }

    return true;
  }

  private shouldReload(
    self: FighterState,
    threatCount: number,
    intel: IntelligenceResult,
  ): boolean {
    if (self.reloadRemaining > 0) return false;
    if (self.ammo >= self.ammoCapacity) return false;
    if (self.actionLockedUntil > 0) return false;
    if (self.deadUntil > 0) return false;

    if (self.ammo === 0) return true;

    if (self.ammo <= Math.ceil(self.ammoCapacity / 2)) {
      if (threatCount <= 1) return true;
      if (intel.dodgeAccuracy > 0.8) return true;
    }

    return false;
  }

  private shouldBomb(
    self: FighterState,
    threatCount: number,
    emergencyBomb: boolean,
  ): boolean {
    if (self.bombs <= 0) return false;
    if (self.bombCooldownUntil > 0) return false;
    if (self.actionLockedUntil > 0) return false;
    if (self.deadUntil > 0) return false;

    if (emergencyBomb) return true;
    if (threatCount >= BOMB_THREAT_THRESHOLD) return true;

    return false;
  }
}

function deterministicUnit(...values: readonly number[]): number {
  let hash = 0x811c9dc5;
  for (const value of values) {
    hash ^= Math.trunc(value) & 0xff;
    hash = Math.imul(hash, 0x01000193) >>> 0;
    hash ^= (Math.trunc(value) >>> 8) & 0xff;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash / 0x100000000;
}
