import Phaser from "phaser";

import { bodyStyle } from "./styles";
import { drawAngledPanel } from "./drawAngledPanel";

export function drawPanelToLayer(scene: Phaser.Scene, layer: Phaser.GameObjects.Container, x: number, y: number, width: number, height: number, title: string): void {
  const graphics = scene.add.graphics();
  drawAngledPanel(graphics, x, y, width, height, 0x101820, 0x34475c, 0.88);
  layer.add(graphics);
  if (title) {
    layer.add(scene.add.text(x + 24, y + 18, title, bodyStyle("#ffcf6e", 17)));
  }
}