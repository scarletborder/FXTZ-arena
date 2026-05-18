import Phaser from "phaser";

import { runFixedTickExample } from "@repo/raid-logic";

import "./styles.css";

class BootScene extends Phaser.Scene {
  public constructor() {
    super("boot");
  }

  public create(): void {
    const { width, height } = this.scale;
    const state = runFixedTickExample(10);

    this.add.rectangle(width / 2, height / 2, width, height, 0x101820);
    this.add
      .text(width / 2, height / 2, `ARENA M0\nFrame ${state.frame}`, {
        color: "#f6f1e6",
        fontFamily: "Arial, sans-serif",
        fontSize: "28px",
        align: "center",
      })
      .setOrigin(0.5);
  }
}

new Phaser.Game({
  type: Phaser.AUTO,
  parent: "game",
  width: 1280,
  height: 720,
  backgroundColor: "#101820",
  scene: [BootScene],
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
});
