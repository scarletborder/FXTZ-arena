import Phaser from "phaser";

import type { ArenaBounds } from "@repo/constants";
import type { FighterState } from "@repo/types";
import type { MobState } from "@repo/types";

import { Depth } from "../../../utils/depth";
import { smoothValue } from "../smooth";
import { lerp, smoothAngle } from "./math";
import type {
  BossDirectionIndicatorPose,
  BossDirectionIndicatorState,
  BossDirectionIndicatorTriangle,
} from "./types";

const BOSS_DIRECTION_INDICATOR_DISTANCE = 180;
const BOSS_DIRECTION_INDICATOR_MIN_DISTANCE = 180;
const BOSS_DIRECTION_INDICATOR_LENGTH = 32;
const BOSS_DIRECTION_INDICATOR_WIDTH = 24;
const BOSS_DIRECTION_INDICATOR_UPDATE_INTERVAL = 2;
const BOSS_DIRECTION_INDICATOR_SMOOTH_BLEND = 0.28;

export class BossDirectionIndicatorView {
  private readonly graphics: Phaser.GameObjects.Graphics;
  private readonly states = new Map<number, BossDirectionIndicatorState>();

  constructor(scene: Phaser.Scene) {
    this.graphics = scene.add.graphics().setDepth(Depth.GrazeCircle + 1);
  }

  render(
    neutralMobs: readonly MobState[],
    localFighter: FighterState,
    frame: number,
    arenaBounds: ArenaBounds,
    alpha: number,
  ): void {
    if (frame % BOSS_DIRECTION_INDICATOR_UPDATE_INTERVAL === 0) {
      this.updateTargets(neutralMobs, localFighter, arenaBounds, alpha);
    }
    this.graphics.clear();
    this.graphics.fillStyle(0x8f1020, 0.92);

    for (const state of this.states.values()) {
      if (!state.target) {
        continue;
      }
      state.current = smoothIndicatorPose(
        state.current,
        state.target,
        BOSS_DIRECTION_INDICATOR_SMOOTH_BLEND,
      );
      const triangle = bossDirectionIndicatorTriangleFromPose(state.current);
      this.graphics.fillTriangle(
        triangle.tipX,
        triangle.tipY,
        triangle.leftX,
        triangle.leftY,
        triangle.rightX,
        triangle.rightY,
      );
    }
    this.graphics.setVisible(true);
  }

  remove(id: number): void {
    this.states.delete(id);
  }

  private updateTargets(
    neutralMobs: readonly MobState[],
    localFighter: FighterState,
    arenaBounds: ArenaBounds,
    alpha: number,
  ): void {
    const activeIndicatorIds = new Set<number>();
    const playerX = lerp(localFighter.previousX, localFighter.x, alpha);
    const playerY = lerp(localFighter.previousY, localFighter.y, alpha);

    for (const mob of neutralMobs) {
      if (
        !mob.active ||
        isLocalFamiliar(mob, localFighter) ||
        (mob.class !== "elite" && mob.class !== "boss")
      ) {
        continue;
      }
      activeIndicatorIds.add(mob.id);
      const target = bossDirectionIndicatorPose(
        mob,
        playerX,
        playerY,
        arenaBounds,
        alpha,
      );
      const state = this.states.get(mob.id);
      if (!target) {
        if (state) {
          state.target = null;
        }
        continue;
      }
      if (state) {
        state.target = target;
      } else {
        this.states.set(mob.id, {
          current: bossDirectionIndicatorInitialPose(
            target,
            playerX,
            playerY,
            arenaBounds,
          ),
          target,
        });
      }
    }

    for (const id of this.states.keys()) {
      if (!activeIndicatorIds.has(id)) {
        this.states.delete(id);
      }
    }
  }
}

function isLocalFamiliar(mob: MobState, localFighter: FighterState): boolean {
  return mob.mobKind === "familiar" && mob.key === localFighter.key;
}

function isPointInsideArena(
  x: number,
  y: number,
  arenaBounds: ArenaBounds,
): boolean {
  return x >= 0 && x <= arenaBounds.width && y >= 0 && y <= arenaBounds.height;
}

function bossDirectionIndicatorPose(
  mob: MobState,
  playerX: number,
  playerY: number,
  arenaBounds: ArenaBounds,
  alpha: number,
): BossDirectionIndicatorPose | null {
  const mobX = lerp(mob.previousX, mob.x, alpha);
  const mobY = lerp(mob.previousY, mob.y, alpha);
  const dx = mobX - playerX;
  const dy = mobY - playerY;
  const distance = Math.hypot(dx, dy);
  if (
    distance <= BOSS_DIRECTION_INDICATOR_MIN_DISTANCE ||
    !Number.isFinite(distance)
  ) {
    return null;
  }

  const ux = dx / distance;
  const uy = dy / distance;
  const centerX = playerX + ux * BOSS_DIRECTION_INDICATOR_DISTANCE;
  const centerY = playerY + uy * BOSS_DIRECTION_INDICATOR_DISTANCE;
  const angle = Math.atan2(uy, ux);
  const triangle = bossDirectionIndicatorTriangleFromPose({
    centerX,
    centerY,
    angle,
  });

  if (
    !isPointInsideArena(triangle.tipX, triangle.tipY, arenaBounds) ||
    !isPointInsideArena(triangle.leftX, triangle.leftY, arenaBounds) ||
    !isPointInsideArena(triangle.rightX, triangle.rightY, arenaBounds)
  ) {
    return null;
  }

  return {
    centerX,
    centerY,
    angle,
  };
}

function bossDirectionIndicatorTriangleFromPose(
  pose: BossDirectionIndicatorPose,
): BossDirectionIndicatorTriangle {
  const ux = Math.cos(pose.angle);
  const uy = Math.sin(pose.angle);
  const halfLength = BOSS_DIRECTION_INDICATOR_LENGTH / 2;
  const halfWidth = BOSS_DIRECTION_INDICATOR_WIDTH / 2;
  const tipX = pose.centerX + ux * halfLength;
  const tipY = pose.centerY + uy * halfLength;
  const baseX = pose.centerX - ux * halfLength;
  const baseY = pose.centerY - uy * halfLength;
  const px = -uy;
  const py = ux;
  const leftX = baseX + px * halfWidth;
  const leftY = baseY + py * halfWidth;
  const rightX = baseX - px * halfWidth;
  const rightY = baseY - py * halfWidth;

  return {
    tipX,
    tipY,
    leftX,
    leftY,
    rightX,
    rightY,
  };
}

function bossDirectionIndicatorInitialPose(
  target: BossDirectionIndicatorPose,
  playerX: number,
  playerY: number,
  arenaBounds: ArenaBounds,
): BossDirectionIndicatorPose {
  const startDistance = Math.min(
    BOSS_DIRECTION_INDICATOR_DISTANCE,
    Math.max(0, BOSS_DIRECTION_INDICATOR_MIN_DISTANCE * 0.45),
  );
  const centerX = Phaser.Math.Clamp(
    playerX + Math.cos(target.angle) * startDistance,
    BOSS_DIRECTION_INDICATOR_LENGTH,
    Math.max(
      BOSS_DIRECTION_INDICATOR_LENGTH,
      arenaBounds.width - BOSS_DIRECTION_INDICATOR_LENGTH,
    ),
  );
  const centerY = Phaser.Math.Clamp(
    playerY + Math.sin(target.angle) * startDistance,
    BOSS_DIRECTION_INDICATOR_LENGTH,
    Math.max(
      BOSS_DIRECTION_INDICATOR_LENGTH,
      arenaBounds.height - BOSS_DIRECTION_INDICATOR_LENGTH,
    ),
  );
  return {
    centerX,
    centerY,
    angle: target.angle,
  };
}

function smoothIndicatorPose(
  current: BossDirectionIndicatorPose,
  target: BossDirectionIndicatorPose,
  blend: number,
): BossDirectionIndicatorPose {
  return {
    centerX: smoothValue(current.centerX, target.centerX, blend),
    centerY: smoothValue(current.centerY, target.centerY, blend),
    angle: smoothAngle(current.angle, target.angle, blend),
  };
}
