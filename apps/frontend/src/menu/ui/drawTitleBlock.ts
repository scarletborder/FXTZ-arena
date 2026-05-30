import Phaser from "phaser";

import { FONT } from "./constants";
import { bodyStyle } from "./styles";

export function drawTitleBlock(scene: Phaser.Scene, title: string, subtitle: string): void {
  scene.add.text(640, 114, title, {
    fontFamily: FONT,
    fontSize: "66px",
    fontStyle: "900",
    color: "#f6f1e6",
  }).setOrigin(0.5);
  scene.add.text(640, 182, subtitle, bodyStyle("#ffcf6e", 22)).setOrigin(0.5);
}