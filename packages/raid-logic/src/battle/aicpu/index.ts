import type { BattleInputState } from "@repo/types";
import type { FighterState, PointState, ProjectileState } from "@repo/content";
import type { NeutralMobState } from "@repo/types";
import { IntelligenceManager } from "./intelligence";
import { Dodger } from "./dodger";
import { StrategyManager } from "./strategy";
import { resetCpuPresets, resolveCpuPreset } from "./presets";

export interface CpuActionContext {
  readonly frame: number;
  readonly self: FighterState;
  readonly opponent: FighterState;
  readonly projectiles: readonly ProjectileState[];
  readonly neutralMobs: readonly NeutralMobState[];
  readonly points: readonly PointState[];
}

/**
 * CPU 玩家主类，整合智能管理、弹幕躲避和进攻策略。
 * 每帧调用 getAction() 获取 BattleInputState 输入。
 */
export class CpuPlayer {
  private readonly intelligence: IntelligenceManager;
  private readonly dodger = new Dodger();
  private readonly strategy = new StrategyManager();

  constructor(options: {
    readonly smartDurationSeconds?: number;
    readonly dumbRampSeconds?: number;
  } = {}) {
    this.intelligence = new IntelligenceManager(options);
  }

  /**
   * 根据当前战局状态生成 CPU 的输入。
   * 返回 BattleInputState，可直接用于 BattleFighter 的控制方法。
   */
  getAction(ctx: CpuActionContext): BattleInputState {
    const { frame, self, opponent, projectiles, neutralMobs, points } = ctx;

    // 1. 更新智能状态（检测命中、推进阶段）
    this.intelligence.update(self.lives, opponent.lives, self.deadUntil);

    // 如果处于死亡状态，返回空输入
    if (self.deadUntil > 0) {
      return createIdleInput(self, opponent);
    }

    const intel = this.intelligence.evaluate();
    const preset = resolveCpuPreset(self);
    const desiredMove = preset?.getDesiredMove?.({
      frame,
      self,
      opponent,
      projectiles,
      neutralMobs,
      points,
      intel,
    });

    // 2. 弹幕躲避
    const dodgeResult = this.dodger.getDodgeMovement(
      self,
      opponent,
      projectiles,
      frame,
      intel,
      desiredMove,
    );

    // 3. 进攻策略。角色 preset 只覆盖特殊玩法；没有 preset 时使用通用策略。
    const presetDecision = preset?.getDecision({
      frame,
      self,
      opponent,
      projectiles,
      neutralMobs,
      points,
      dodgeResult,
      intel,
    });
    const strategy =
      presetDecision ??
      this.strategy.getActions(
        frame,
        self,
        opponent,
        dodgeResult.threatCount,
        dodgeResult.emergencyBomb,
        intel,
      );

    // 4. 如果没有威胁，使用战略性走位
    let moveX = dodgeResult.moveX;
    let moveY = dodgeResult.moveY;
    if (moveX === 0 && moveY === 0 && dodgeResult.threatCount === 0) {
      const strategic =
        presetDecision?.strategicMove ??
        this.dodger.getStrategicMovement(self, opponent);
      moveX = strategic.moveX;
      moveY = strategic.moveY;
    }

    return {
      moveX,
      moveY,
      aimX: strategy.aimX,
      aimY: strategy.aimY,
      shootPressed: strategy.shootPressed,
      bombPressed: strategy.bombPressed,
      activeCardPressed: false, // 暂时不使用主动能力卡
      reloadPressed: strategy.reloadPressed,
      alternateHeld: strategy.alternateHeld,
      infoHeld: false,
    };
  }

  /** 受击重置（外部调用） */
  reset(): void {
    this.intelligence.reset();
    this.dodger.reset();
    this.strategy.reset();
    resetCpuPresets();
  }

  /** 获取当前智能状态（用于 debug） */
  get debugIntel(): { phaseTicks: number; isDumb: boolean } {
    return {
      phaseTicks: this.intelligence["phaseTicks"],
      isDumb: this.intelligence.isDumb(),
    };
  }
}

function createIdleInput(
  self: FighterState,
  opponent: FighterState,
): BattleInputState {
  return {
    moveX: 0,
    moveY: 0,
    aimX: opponent.x,
    aimY: opponent.y,
    shootPressed: false,
    bombPressed: false,
    activeCardPressed: false,
    reloadPressed: false,
    alternateHeld: self.activeCharacter.id === self.alternateCharacter.id,
    infoHeld: false,
  };
}
