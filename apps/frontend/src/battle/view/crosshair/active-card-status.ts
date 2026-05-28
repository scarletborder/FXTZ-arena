import Phaser from "phaser";

import { Depth } from "../../../utils/depth";
import type { ActiveCardStatusParams } from "./types";

export class CrosshairActiveCardStatus {
  private readonly text: Phaser.GameObjects.Text;
  private readonly battery: Phaser.GameObjects.Graphics;

  constructor(scene: Phaser.Scene) {
    this.text = scene.add
      .text(0, 0, "", {
        fontFamily: "Arial, 'Microsoft YaHei', sans-serif",
        fontSize: "13px",
        color: "#8fffc1",
        stroke: "#06140c",
        strokeThickness: 2,
      })
      .setOrigin(0, 0.5)
      .setDepth(Depth.CrosshairText);
    this.battery = scene.add.graphics().setDepth(Depth.CrosshairText);
  }

  render(params: ActiveCardStatusParams, x: number, y: number): void {
    this.battery.clear();
    if (!params.activeCardUseLimit || params.activeCardUses <= 0) {
      this.text.setVisible(false);
      return;
    }

    const cooling =
      params.activeCardCooldownRemaining > 0 &&
      params.activeCardCooldownTotal > 0;
    this.text.setVisible(!cooling);
    if (!cooling) {
      const uses =
        params.activeCardUseLimit === "infinite"
          ? "INF"
          : String(params.activeCardUses);
      this.text.setPosition(x, y);
      this.text.setText(`E:${uses}`);
      return;
    }

    this.drawBattery(
      x,
      y,
      params.activeCardCooldownRemaining,
      params.activeCardCooldownTotal,
    );
  }

  private drawBattery(
    x: number,
    y: number,
    cooldownRemaining: number,
    cooldownTotal: number,
  ): void {
    const width = 30;
    const height = 13;
    const cooldownRatio = Math.max(
      0,
      Math.min(1, cooldownRemaining / Math.max(1, cooldownTotal)),
    );
    const elapsedRatio = 1 - cooldownRatio;

    this.battery
      .lineStyle(2, 0x8fffc1, 0.95)
      .strokeRoundedRect(x, y - height / 2, width, height, 2)
      .fillStyle(0x8fffc1, 0.95)
      .fillRect(x + width + 2, y - 3, 4, 6)
      .fillStyle(0x20342c, 0.8)
      .fillRoundedRect(x + 3, y - height / 2 + 3, width - 6, height - 6, 1)
      .fillStyle(0x4dff88, 0.95)
      .fillRect(
        x + 3,
        y - height / 2 + 3,
        (width - 6) * elapsedRatio,
        height - 6,
      );
  }
}
