import Phaser from "phaser";

import { bodyStyle } from "./styles";
import { drawAngledPanel } from "./drawAngledPanel";

export function createPreviewArena(scene: Phaser.Scene, x: number, y: number, title: string, draw: (target: Phaser.GameObjects.Container) => void): Phaser.GameObjects.Container {
  const container = scene.add.container(x, y);
  const graphics = scene.add.graphics();
  drawAngledPanel(graphics, 0, 0, 508, 220, 0x0f141d, 0x34475c, 0.98);
  graphics.lineStyle(1, 0x273548, 0.55);
  for (let row = 0; row < 5; row += 1) {
    graphics.lineBetween(28, 36 + row * 36, 478, 36 + row * 36);
  }
  container.add(graphics);
  container.add(scene.add.text(24, 20, title, bodyStyle("#ffcf6e", 18)));
  draw(container);
  return container;
}