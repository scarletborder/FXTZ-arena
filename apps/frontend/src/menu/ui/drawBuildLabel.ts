import Phaser from "phaser";

import { APP_BUILD_LABEL } from "@repo/constants";

import { GAME_HEIGHT, GAME_WIDTH } from "./constants";
import { bodyStyle } from "./styles";

export function drawBuildLabel(scene: Phaser.Scene, x = GAME_WIDTH - 26, y = GAME_HEIGHT - 22): Phaser.GameObjects.Text {
  return scene.add.text(x, y, APP_BUILD_LABEL, {
    ...bodyStyle("#9fb4c8", 15),
    align: "right",
  }).setOrigin(1, 1).setAlpha(0.82);
}