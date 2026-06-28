import type { MobState } from "@repo/types";

import type { CharacterMobMotionConfig, EnemyAnimationName } from "./types";

export function mobMotionConfig(mob: MobState): {
  readonly animation: EnemyAnimationName;
  readonly direction: -1 | 1;
} {
  const dx = mob.x - mob.previousX;
  const dy = mob.y - mob.previousY;
  const isHorizontal = Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 0.5;
  if (!isHorizontal) {
    return { animation: "default", direction: 1 };
  }
  return { animation: "move", direction: dx < 0 ? -1 : 1 };
}

export function characterMobMotionConfig(
  mob: MobState,
  frame: number,
): CharacterMobMotionConfig {
  const dx = mob.x - mob.previousX;
  const dy = mob.y - mob.previousY;
  const moving = Math.hypot(dx, dy) > 0.5;
  const horizontal = Math.abs(dx) > Math.abs(dy);
  const column = horizontal ? 2 : dy < 0 ? 1 : 0;
  const step = moving ? Math.floor(frame / 10) % 2 : 0;
  return {
    frame: column + step * 3,
    flipX: horizontal && dx >= 0,
  };
}

export function characterMobDisplaySize(mob: MobState): number {
  const hitboxWidth = mob.hitWidth ?? mob.hitRadius * 2;
  const hitboxHeight = mob.hitHeight ?? mob.hitRadius * 2;
  return Math.max(hitboxWidth, hitboxHeight) * 1.2;
}
