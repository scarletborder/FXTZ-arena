import Phaser from "phaser";

import { bodyStyle } from "./styles";
import { drawAngledPanel } from "./drawAngledPanel";

export function drawPanel(scene: Phaser.Scene, x: number, y: number, width: number, height: number, title: string): void {
  const graphics = scene.add.graphics();
  drawAngledPanel(graphics, x, y, width, height, 0x101820, 0x34475c, 0.88);
  if (title) {
    scene.add.text(x + 26, y + 18, title, bodyStyle("#ffcf6e", 18));
  }
}