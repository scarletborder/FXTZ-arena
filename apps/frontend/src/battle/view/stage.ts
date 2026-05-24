import Phaser from "phaser";

import {
  ARENA_BOTTOM,
  ARENA_HEIGHT_PX,
  ARENA_LEFT,
  ARENA_RIGHT,
  ARENA_TOP,
  ARENA_WIDTH_PX,
} from "@repo/constants";

export type BattleViewMode = "ai" | "training" | "online";

export function createBattleStage(scene: Phaser.Scene, _mode: BattleViewMode): void {
  const bg = scene.add.graphics();
  bg.fillStyle(0x04070b, 1);
  bg.fillRect(ARENA_LEFT, ARENA_TOP, ARENA_WIDTH_PX, ARENA_HEIGHT_PX);
  bg.fillStyle(0x07131b, 1);
  bg.fillRect(ARENA_LEFT, ARENA_TOP, ARENA_WIDTH_PX, ARENA_HEIGHT_PX);
  bg.lineStyle(1, 0x203141, 0.85);
  for (let x = ARENA_LEFT; x <= ARENA_RIGHT; x += 60) {
    bg.lineBetween(x, ARENA_TOP, x, ARENA_BOTTOM);
  }
  for (let y = ARENA_TOP; y <= ARENA_BOTTOM; y += 60) {
    bg.lineBetween(ARENA_LEFT, y, ARENA_RIGHT, y);
  }
  bg.lineStyle(2, 0x335267, 0.9);
  bg.strokeRect(ARENA_LEFT, ARENA_TOP, ARENA_WIDTH_PX, ARENA_HEIGHT_PX);
}
