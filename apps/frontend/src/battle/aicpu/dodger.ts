import { ARENA_HEIGHT_PX, ARENA_WIDTH_PX, PLAYER_CORE_RADIUS } from "../constants";
import type { FighterState, ProjectileState } from "../types";
import type { IntelligenceResult } from "./intelligence";

/** 竞技场边距阈值 */
const WALL_MARGIN = 48;
/** 威胁判定锥形角度（弧度） */
const THREAT_CONE = Math.PI / 4;
/** 安全系数 */
const SAFETY_FACTOR = 4;
/** 最大追踪距离 */
const MAX_THREAT_DIST = 500;
/** 闪避动量混合系数 0~1, 越大越保留前一帧方向 */
const MOMENTUM_BLEND = 0.45;
/** 诱导子弹额外危险倍率 */
const HOMING_DANGER_BONUS = 1.8;

export interface DodgeResult {
  readonly moveX: -1 | 0 | 1;
  readonly moveY: -1 | 0 | 1;
  readonly threatCount: number;
  readonly emergencyBomb: boolean;
}

/** 单个威胁信息 */
interface Threat {
  danger: number;
  escapeX: number;
  escapeY: number;
}

export class Dodger {
  private prevEscapeX = 0;
  private prevEscapeY = 0;

  /** 根据周围弹幕和智能状态计算闪避方向 */
  getDodgeMovement(
    self: FighterState,
    opponent: FighterState,
    projectiles: readonly ProjectileState[],
    frame: number,
    intel: IntelligenceResult,
  ): DodgeResult {
    const threats = this.evaluateThreats(self, projectiles, frame);

    // 紧急 bomb 判定：有弹幕即将直接命中
    const emergencyBomb = threats.some(
      (t) => t.danger > 5 && intel.dodgeAccuracy > 0.3,
    );

    // 合成逃逸向量
    let evadeX = 0;
    let evadeY = 0;
    for (const threat of threats) {
      evadeX += threat.escapeX * threat.danger;
      evadeY += threat.escapeY * threat.danger;
    }

    // 墙壁回避
    const wallX = this.wallAvoidance(self.x, WALL_MARGIN, ARENA_WIDTH_PX);
    const wallY = this.wallAvoidance(self.y, WALL_MARGIN, ARENA_HEIGHT_PX);
    evadeX += wallX * 3;
    evadeY += wallY * 3;

    // 距离控制
    const dx = opponent.x - self.x;
    const dy = opponent.y - self.y;
    const dist = Math.hypot(dx, dy);
    const distWeight = 1 - intel.dodgeAccuracy;
    if (dist < 150) {
      evadeX -= (dx / dist) * distWeight * 3;
      evadeY -= (dy / dist) * distWeight * 3;
    } else if (dist > 500) {
      evadeX += (dx / dist) * distWeight * 2;
      evadeY += (dy / dist) * distWeight * 2;
    } else if (dist > 350 && intel.dodgeAccuracy > 0.5) {
      evadeX += (dx / dist) * intel.dodgeAccuracy * 0.5;
      evadeY += (dy / dist) * intel.dodgeAccuracy * 0.5;
    }

    // 闪避动量：与上一帧逃逸方向混合，减少连续帧的方向抖动
    // 只在聪明阶段或威胁较多时启用，避免愚钝阶段"惯性太大"
    if (intel.dodgeAccuracy > 0.3 || threats.length >= 2) {
      const len = Math.hypot(evadeX, evadeY);
      if (len > 0.01) {
        evadeX /= len;
        evadeY /= len;
        const momentumX = evadeX * (1 - MOMENTUM_BLEND) + this.prevEscapeX * MOMENTUM_BLEND;
        const momentumY = evadeY * (1 - MOMENTUM_BLEND) + this.prevEscapeY * MOMENTUM_BLEND;
        const momentumLen = Math.hypot(momentumX, momentumY);
        if (momentumLen > 0.01) {
          evadeX = (momentumX / momentumLen) * len * intel.dodgeAccuracy;
          evadeY = (momentumY / momentumLen) * len * intel.dodgeAccuracy;
        }
      }
    }
    this.prevEscapeX = evadeX;
    this.prevEscapeY = evadeY;

    // 应用精度退化(噪声)
    if (intel.dodgeAccuracy < 1) {
      const len = Math.hypot(evadeX, evadeY);
      if (len > 0.01) {
        const noise = intel.aimNoise;
        const angle = Math.atan2(evadeY, evadeX) + (Math.random() - 0.5) * 2 * noise;
        const reducedLen = len * intel.dodgeAccuracy;
        evadeX = Math.cos(angle) * reducedLen;
        evadeY = Math.sin(angle) * reducedLen;
      }
    }

    // 愚钝状态下偶尔完全不躲
    if (intel.isDumb && threats.length > 0 && Math.random() < 0.5) {
      evadeX = 0;
      evadeY = 0;
    }

    return {
      moveX: this.sign(evadeX) as -1 | 0 | 1,
      moveY: this.sign(evadeY) as -1 | 0 | 1,
      threatCount: threats.length,
      emergencyBomb,
    };
  }

  /** 如果没有威胁，生成战略性走位（面向对手的横移/靠近） */
  getStrategicMovement(
    self: FighterState,
    opponent: FighterState,
  ): { moveX: -1 | 0 | 1; moveY: -1 | 0 | 1 } {
    const dx = opponent.x - self.x;
    const dy = opponent.y - self.y;
    const dist = Math.hypot(dx, dy);

    let targetX = 0;
    let targetY = 0;

    if (dist < 150) {
      targetX = -dx / dist;
      targetY = -dy / dist;
    } else if (dist > 400) {
      targetX = dx / dist;
      targetY = dy / dist;
    } else {
      // 横移（垂直于玩家方向）
      const perpX = -dy / dist;
      const perpY = dx / dist;
      targetX = perpX;
      targetY = perpY;
    }

    // 墙壁回避
    targetX += this.wallAvoidance(self.x, WALL_MARGIN, ARENA_WIDTH_PX);
    targetY += this.wallAvoidance(self.y, WALL_MARGIN, ARENA_HEIGHT_PX);

    return {
      moveX: this.sign(targetX) as -1 | 0 | 1,
      moveY: this.sign(targetY) as -1 | 0 | 1,
    };
  }

  /** 重置闪避动量（受击复活后调用） */
  reset(): void {
    this.prevEscapeX = 0;
    this.prevEscapeY = 0;
  }

  private evaluateThreats(
    self: FighterState,
    projectiles: readonly ProjectileState[],
    frame: number,
  ): Threat[] {
    const threats: Threat[] = [];

    for (const projectile of projectiles) {
      if (projectile.owner === "target") continue;
      if (frame < projectile.visibleFrom) continue;
      if (projectile.damage <= 0) continue;
      if (projectile.pausedUntil > frame) continue;

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

    // 激光向 CPU 方向延伸(允许略过身后一个判定圈)
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

    // 方向检测：弹幕是否朝向 CPU
    const toCpuAngle = Math.atan2(dy, dx);
    let angleDiff = toCpuAngle - angle;
    angleDiff = ((angleDiff + Math.PI) % (Math.PI * 2)) - Math.PI;

    if (Math.abs(angleDiff) > THREAT_CONE) return null;

    // 向前分量：弹幕是否接近 CPU
    const forward = dx * Math.cos(angle) + dy * Math.sin(angle);
    if (forward < 0) return null;

    // 侧向距离
    const side = Math.abs(-dx * Math.sin(angle) + dy * Math.cos(angle));
    const threatRadius = projectile.height / 2 + PLAYER_CORE_RADIUS * SAFETY_FACTOR;
    if (side > threatRadius) return null;

    // 考虑诱导弹的弹道弯曲
    const isHoming = projectile.kind === "orb" && frame >= projectile.homingStartAt && frame <= projectile.homingUntil;
    let timeToClosest = forward / speed;
    if (isHoming) {
      timeToClosest = Math.min(timeToClosest, dist / (speed * 1.2));
    }

    if (timeToClosest < 0) return null;

    let danger = Math.max(0.05, (threatRadius - side) / threatRadius / Math.max(1, timeToClosest / 15));

    // 诱导子弹额外危险倍率
    if (isHoming) {
      danger *= HOMING_DANGER_BONUS;
    }

    let escapeX: number;
    let escapeY: number;

    if (isHoming) {
      // 对诱导弹：沿 弹→CPU 连线的垂直方向逃逸(切线方向)
      // 这样让诱导弹需要不断大幅转向才能追上，效率最高
      const orbToCpuAngle = Math.atan2(-dy, -dx);
      escapeX = -Math.sin(orbToCpuAngle);
      escapeY = Math.cos(orbToCpuAngle);
    } else if (side < PLAYER_CORE_RADIUS * 2) {
      // 弹幕几乎正对 CPU：沿弹幕垂直方向逃逸
      escapeX = -Math.sin(angle);
      escapeY = Math.cos(angle);
    } else {
      // 弹幕从侧面来：朝远离弹幕的方向逃逸
      const sideSign = Math.sign(-dx * Math.sin(angle) + dy * Math.cos(angle));
      escapeX = Math.sin(angle) * sideSign;
      escapeY = -Math.cos(angle) * sideSign;
    }

    // 归一化
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

  private sign(value: number): number {
    if (value > 0.3) return 1;
    if (value < -0.3) return -1;
    return 0;
  }
}
