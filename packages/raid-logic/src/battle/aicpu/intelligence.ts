import { fp } from "@shaisrc/fixed-point";

import { secondsToTicks } from "@repo/types";

/** 聪明阶段持续 tick 数: 35 秒 */
const SMART_DURATION_TICKS = secondsToTicks(35);
/** 钝化阶段持续 tick 数: 20 秒 */
const DULLING_DURATION_TICKS = secondsToTicks(20);
/** 钝化阶段最大反应延迟 tick */
const MAX_REACTION_DELAY = 20;
/** 钝化阶段最大瞄准噪声(弧度) */
const MAX_AIM_NOISE = 0.3;
const CRASH_INTERVAL = 180;
const CRASH_ACCUM_DELTA = 0.08;

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
  /** 愚钝阶段每隔3秒触发8%累加概率撞向子弹 */
  readonly crashIntoBullet: boolean;
}

export class IntelligenceManager {
  private phaseTicks = 0;
  private dumbTicks = 0;
  private crashAccumulator = 0;
  private prevSelfLives = 2;
  private prevOpponentLives = 2;

  /**
   * 每一帧调用，检测命中并推进阶段。
   * @param selfLives - CPU 自身剩余命数
   * @param opponentLives - 对手(玩家)剩余命数
   * @param selfDeadUntil - CPU 的死亡倒计时
   */
  update(selfLives: number, opponentLives: number, selfDeadUntil: number): void {
    if (selfLives < this.prevSelfLives || opponentLives < this.prevOpponentLives) {
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
        crashIntoBullet: false,
      };
    }

    const dullingElapsed = this.phaseTicks - SMART_DURATION_TICKS;
    if (dullingElapsed < DULLING_DURATION_TICKS) {
      const fpProgress = fp.div(fp.fromInt(dullingElapsed), fp.fromInt(DULLING_DURATION_TICKS));
      const progress = fp.toFloat(fpProgress);
      return {
        dodgeAccuracy: fp.toFloat(fp.sub(fp.fromInt(1), fp.mul(fpProgress, fp.fromFloat(0.9)))),
        reactionDelay: Math.round(fp.toFloat(fp.mul(fpProgress, fp.fromInt(MAX_REACTION_DELAY)))),
        aimNoise: fp.toFloat(fp.mul(fpProgress, fp.fromFloat(MAX_AIM_NOISE))),
        isDumb: false,
        dullingProgress: progress,
        canAct: fp.lt(fpProgress, fp.fromFloat(0.5)) || (dullingElapsed % 30) < 15,
        crashIntoBullet: false,
      };
    }

    let crashIntoBullet = false;
    if (this.dumbTicks > 0 && this.dumbTicks % CRASH_INTERVAL === 0) {
      this.crashAccumulator = fp.toFloat(
        fp.add(fp.fromFloat(this.crashAccumulator), fp.fromFloat(CRASH_ACCUM_DELTA)),
      );
      if (fp.lt(fp.fromFloat(deterministicUnit(this.phaseTicks, this.dumbTicks)), fp.fromFloat(this.crashAccumulator))) {
        crashIntoBullet = true;
        this.crashAccumulator = 0;
      }
    }

    return {
      dodgeAccuracy: 0,
      reactionDelay: MAX_REACTION_DELAY,
      aimNoise: MAX_AIM_NOISE,
      isDumb: true,
      dullingProgress: 1,
      canAct: true,
      crashIntoBullet,
    };
  }

  isDumb(): boolean {
    return this.phaseTicks >= SMART_DURATION_TICKS + DULLING_DURATION_TICKS;
  }

  reset(): void {
    this.phaseTicks = 0;
    this.dumbTicks = 0;
    this.crashAccumulator = 0;
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
