import Phaser from "phaser";

import { Depth } from "../../../utils/depth";

export class CrosshairStatusMarkers {
  private readonly lifeMarkers: readonly Phaser.GameObjects.Text[];
  private readonly bombIcons: readonly Phaser.GameObjects.Image[];

  constructor(scene: Phaser.Scene) {
    this.lifeMarkers = Array.from({ length: 6 }, () =>
      scene.add
        .text(0, 0, "♥", {
          fontFamily: "Arial, 'Microsoft YaHei', sans-serif",
          fontSize: "15px",
          color: "#ff3131",
          stroke: "#ffd0d0",
          strokeThickness: 1,
        })
        .setOrigin(0.5)
        .setDepth(Depth.Crosshair),
    );
    this.bombIcons = Array.from({ length: 6 }, () =>
      scene.add
        .image(0, 0, "bomb")
        .setOrigin(0.5)
        .setScale(0.085)
        .setTint(0xaec7ff)
        .setDepth(Depth.Crosshair),
    );
  }

  render(params: {
    readonly x: number;
    readonly y: number;
    readonly lives: number;
    readonly bombs: number;
  }): void {
    for (let index = 0; index < this.lifeMarkers.length; index += 1) {
      const marker = this.lifeMarkers[index];
      marker.setPosition(params.x + index * 14, params.y + 58);
      marker.setVisible(index < params.lives);
    }

    for (let index = 0; index < this.bombIcons.length; index += 1) {
      const icon = this.bombIcons[index];
      icon.setPosition(params.x + index * 14, params.y + 78);
      icon.setVisible(index < params.bombs);
    }
  }

  setVisible(visible: boolean): void {
    for (const marker of this.lifeMarkers) {
      marker.setVisible(visible);
    }
    for (const icon of this.bombIcons) {
      icon.setVisible(visible);
    }
  }
}
