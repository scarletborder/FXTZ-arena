import { bulletSpeedRankToPixelsPerTick, secondsToTicks } from "@repo/types";

import type { FighterState } from "../types";
import type { IntelligenceResult } from "./intelligence";

/** 紧急 bomb 的威胁数量阈值 */
const BOMB_THREAT_THRESHOLD = 3;
/** 切换角色后的最小冷却 tick */
const SWITCH_COOLDOWN_TICKS = secondsToTicks(1.5);
/** 主动切换间隔 tick（约 10 秒换一次，保证两个角色都被使用） */
const PROACTIVE_SWITCH_INTERVAL = secondsToTicks(10);
/** 使用当前角色至少射击多少次后再考虑主动切换 */
const MIN_SHOTS_BEFORE_SWITCH = 2;

export interface StrategyAction {
  readonly shootPressed: boolean;
  readonly bombPressed: boolean;
  readonly reloadPressed: boolean;
  /** true=使用特殊角色(魔理沙)，false=使用常驻角色(灵梦) */
  readonly alternateHeld: boolean;
  readonly aimX: number;
  readonly aimY: number;
}

export class StrategyManager {
  private switchCooldown = 0;
  /** 距上次切换经过的 tick 数 */
  private switchTimer = 0;
  /** 当前角色已射击次数 */
  private shotsSinceSwitch = 0;

  getActions(
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
    const shootPressed = this.shouldShoot(self, intel);
    const reloadPressed = this.shouldReload(self, threatCount, intel);
    const bombPressed = this.shouldBomb(self, threatCount, emergencyBomb);

    // 如果本轮射击了，累计计数
    if (shootPressed) {
      this.shotsSinceSwitch += 1;
    }

    // 预判瞄准：预测玩家的移动方向
    const { aimX, aimY } = this.predictiveAim(self, opponent);

    return { shootPressed, bombPressed, reloadPressed, alternateHeld, aimX, aimY };
  }

  reset(): void {
    this.switchCooldown = 0;
    this.switchTimer = 0;
    this.shotsSinceSwitch = 0;
  }

  // ── 角色切换 ──────────────────────────────────────────

  /** 每帧根据弹药、冷却和时间决定使用哪个角色 */
  private decideCharacter(self: FighterState): boolean {
    if (this.switchCooldown > 0) {
      return self.activeCharacter.id === self.alternateCharacter.id;
    }

    const usingAlternate = self.activeCharacter.id === self.alternateCharacter.id;
    const currentAmmo = self.ammo;
    const primaryAmmo = (self.ammoByCharacterId[self.primaryCharacter.id] ?? self.primaryCharacter.ammoCapacity);
    const alternateAmmo = (self.ammoByCharacterId[self.alternateCharacter.id] ?? self.alternateCharacter.ammoCapacity);
    const otherAmmo = usingAlternate ? primaryAmmo : alternateAmmo;

    // ① 当前角色弹药耗尽，另一角色有弹 → 立即切换
    if (currentAmmo <= 0 && otherAmmo > 0) {
      return this.commitSwitch(usingAlternate);
    }

    // ② 主动轮换：距上次切换超过间隔且当前角色已射过几发
    if (this.switchTimer >= PROACTIVE_SWITCH_INTERVAL) {
      if (this.shotsSinceSwitch >= MIN_SHOTS_BEFORE_SWITCH && otherAmmo > 0) {
        return this.commitSwitch(usingAlternate);
      }
    }

    return usingAlternate;
  }

  /** 执行切换并重置计时器，返回新的 alternateHeld 值 */
  private commitSwitch(usingAlternate: boolean): boolean {
    this.switchCooldown = SWITCH_COOLDOWN_TICKS;
    this.switchTimer = 0;
    this.shotsSinceSwitch = 0;
    return !usingAlternate;
  }

  // ── 预判瞄准 ──────────────────────────────────────────

  /**
   * 基于玩家当前速度预测其移动方向，引导射击提前量。
   * 弹速越慢(灵梦)、玩家越快时预判量越大；弹速越快(魔理沙)预判量越小。
   */
  private predictiveAim(
    self: FighterState,
    opponent: FighterState,
  ): { aimX: number; aimY: number } {
    // 玩家移动速度(像素/帧)
    const playerVx = opponent.x - opponent.previousX;
    const playerVy = opponent.y - opponent.previousY;

    // 弹速
    const bulletSpeed = bulletSpeedRankToPixelsPerTick(self.activeCharacter.bulletSpeed);

    // 到玩家的距离
    const dx = opponent.x - self.x;
    const dy = opponent.y - self.y;
    const dist = Math.hypot(dx, dy);

    // 飞行时间 = 距离 / 弹速
    const travelTime = Math.max(1, dist / Math.max(bulletSpeed, 0.1));

    // 预判位置 = 当前位置 + 速度 × 飞行时间 × 修正系数
    // 系数 0.6 避免完全跟随理论值导致超调(玩家可能变向)
    const leadFactor = 0.6;
    const aimX = opponent.x + playerVx * travelTime * leadFactor;
    const aimY = opponent.y + playerVy * travelTime * leadFactor;

    return { aimX, aimY };
  }

  // ── 攻击决策 ──────────────────────────────────────────

  private shouldShoot(self: FighterState, intel: IntelligenceResult): boolean {
    if (self.reloadRemaining > 0) return false;
    if (self.ammo <= 0) return false;
    if (self.fireCooldownUntil > 0) return false;
    if (self.actionLockedUntil > 0) return false;
    if (self.deadUntil > 0) return false;

    // 钝化阶段后期随机跳过射击
    if (intel.dullingProgress > 0.5 && Math.random() < intel.dullingProgress * 0.3) {
      return false;
    }

    return true;
  }

  private shouldReload(self: FighterState, threatCount: number, intel: IntelligenceResult): boolean {
    if (self.reloadRemaining > 0) return false;
    if (self.ammo >= self.ammoCapacity) return false;
    if (self.actionLockedUntil > 0) return false;
    if (self.deadUntil > 0) return false;

    // 弹药为 0 时立即装弹
    if (self.ammo === 0) return true;

    // 弹药少于一半时，如果安全就装弹
    if (self.ammo <= Math.ceil(self.ammoCapacity / 2)) {
      if (threatCount <= 1) return true;
      if (intel.dodgeAccuracy > 0.8) return true;
    }

    return false;
  }

  private shouldBomb(self: FighterState, threatCount: number, emergencyBomb: boolean): boolean {
    if (self.bombs <= 0) return false;
    if (self.bombCooldownUntil > 0) return false;
    if (self.actionLockedUntil > 0) return false;
    if (self.deadUntil > 0) return false;

    if (emergencyBomb) return true;
    if (threatCount >= BOMB_THREAT_THRESHOLD) return true;

    return false;
  }
}
