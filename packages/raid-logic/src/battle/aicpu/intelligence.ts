import { fp } from "@shaisrc/fixed-point";

import { secondsToTicks } from "@repo/types";

/** 聪明阶段持续 tick 数: 35 秒 */
const SMART_DURATION_TICKS = secondsToTicks(35);
/** 愚钝阶段达到最大失误率所需 tick 数: 30 秒 */
const DUMB_RAMP_TICKS = secondsToTicks(30);
/** 愚钝阶段最大不躲避概率 */
const MAX_IGNORE_DODGE_CHANCE = 0.9;

export interface IntelligenceResult {
  /** 0..1 的闪避精度，1=完美，0=完全不躲 */
  readonly dodgeAccuracy: number;
  /** 延迟反应 tick 数 */
  readonly reactionDelay: number;
  /** 瞄准随机偏移量（弧度） */
  readonly aimNoise: number;
  /** 是否完全愚钝 */
  readonly isDumb: boolean;
  /** 当前钝化进度 0..1，聪明阶段=0，愚钝阶段=1 */
  readonly dullingProgress: number;
  /** 是否允许使用 bomb (不完全是) */
  readonly canAct: boolean;
  /** 本帧是否放弃躲避，但不会主动选择撞弹方向 */
  readonly ignoreDodge: boolean;
}

export class IntelligenceManager {
  private phaseTicks = 0;
  private dumbTicks = 0;
  private prevSelfLives = 2;
  private prevOpponentLives = 2;

  /**
   * 每一帧调用，检测命中并推进阶段。
   * @param selfLives - CPU 自身剩余命数
   * @param opponentLives - 对手(玩家)剩余命数
   * @param selfDeadUntil - CPU 的死亡倒计时
   */
  update(
    selfLives: number,
    opponentLives: number,
    selfDeadUntil: number,
  ): void {
    if (
      selfLives < this.prevSelfLives ||
      opponentLives < this.prevOpponentLives
    ) {
      this.reset();
    }
    this.prevSelfLives = selfLives;
    this.prevOpponentLives = opponentLives;

    if (selfDeadUntil > 0) {
      return;
    }

    if (!this.isDumb()) {
      this.phaseTicks += 1;
    } else {
      this.dumbTicks += 1;
    }
  }

  /** 返回当前帧的智能状态参数 */
  evaluate(): IntelligenceResult {
    if (this.phaseTicks < SMART_DURATION_TICKS) {
      return {
        dodgeAccuracy: 1,
        reactionDelay: 0,
        aimNoise: 0,
        isDumb: false,
        dullingProgress: 0,
        canAct: true,
        ignoreDodge: false,
      };
    }

    const fpProgress = fp.div(
      fp.fromInt(Math.min(this.dumbTicks, DUMB_RAMP_TICKS)),
      fp.fromInt(DUMB_RAMP_TICKS),
    );
    const progress = fp.toFloat(fpProgress);
    const ignoreChance = fp.toFloat(
      fp.mul(
        fp.mul(fpProgress, fpProgress),
        fp.fromFloat(MAX_IGNORE_DODGE_CHANCE),
      ),
    );
    const ignoreDodge =
      deterministicUnit(this.phaseTicks, this.dumbTicks) < ignoreChance;

    return {
      dodgeAccuracy: ignoreDodge ? 0 : 1,
      reactionDelay: 0,
      aimNoise: 0,
      isDumb: true,
      dullingProgress: progress,
      canAct: true,
      ignoreDodge,
    };
  }

  isDumb(): boolean {
    return this.phaseTicks >= SMART_DURATION_TICKS;
  }

  reset(): void {
    this.phaseTicks = 0;
    this.dumbTicks = 0;
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
