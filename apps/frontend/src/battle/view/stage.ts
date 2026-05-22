import Phaser from "phaser";

import {
  ARENA_BOTTOM,
  ARENA_HEIGHT_PX,
  ARENA_LEFT,
  ARENA_RIGHT,
  ARENA_TOP,
  ARENA_WIDTH_PX,
  GAME_HEIGHT,
  GAME_WIDTH,
  HUD_TOP,
  SIDEBAR_LEFT,
  SIDEBAR_TOP,
} from "@repo/constants";

export type BattleViewMode = "ai" | "training" | "online";

export function createBattleStage(scene: Phaser.Scene, mode: BattleViewMode): void {
  const bg = scene.add.graphics();
  bg.fillStyle(0x04070b, 1);
  bg.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
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
  if (mode === "training") {
    bg.fillStyle(0x05080d, 0.82);
    bg.fillRect(SIDEBAR_LEFT, SIDEBAR_TOP, 286, GAME_HEIGHT - 32);
    bg.lineStyle(1, 0x273548, 1);
    bg.strokeRect(SIDEBAR_LEFT, SIDEBAR_TOP, 286, GAME_HEIGHT - 32);
  }
  bg.fillStyle(0x04070b, 0.82);
  bg.fillRect(16, HUD_TOP, GAME_WIDTH - 32, 96);
  bg.lineStyle(1, 0x273548, 1);
  bg.strokeRect(16, HUD_TOP, GAME_WIDTH - 32, 96);

  scene.add.text(42, 30, getModeTitle(mode), {
    fontFamily: "Arial, 'Microsoft YaHei', sans-serif",
    fontSize: "26px",
    color: "#f3efe3",
  });

  if (mode !== "training") return;

  scene.add.text(SIDEBAR_LEFT + 14, 28, "训练数据", {
    fontFamily: "Arial, 'Microsoft YaHei', sans-serif",
    fontSize: "20px",
    color: "#f3efe3",
  });
}

function getModeTitle(mode: BattleViewMode): string {
  if (mode === "ai") return "人机对战";
  if (mode === "online") return "联机对战";
  return "靶场";
}
