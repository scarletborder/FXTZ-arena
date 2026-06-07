import Phaser from "phaser";
import type { BodyDebugData } from "@repo/raid-logic";

import { Depth } from "../../utils/depth";

export class BattleDebugView {
  private readonly graphics: Phaser.GameObjects.Graphics;
  private enabled = false;

  constructor(scene: Phaser.Scene) {
    this.graphics = scene.add.graphics();
    this.graphics.setDepth(Depth.Debug);
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    this.graphics.setVisible(enabled);
    if (!enabled) {
      this.graphics.clear();
    }
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  renderBodies(data: readonly BodyDebugData[]): void {
    if (!this.enabled) return;
    this.graphics.clear();

    for (const body of data) {
      this.graphics.fillStyle(0xff0000, 0.35);
      this.graphics.lineStyle(2, 0xff0000, 1);

      if (body.shape === "ball") {
        this.graphics.fillCircle(body.x, body.y, body.halfWidth);
        this.graphics.strokeCircle(body.x, body.y, body.halfWidth);
      } else {
        this.graphics.save();
        this.graphics.translateCanvas(body.x, body.y);
        this.graphics.rotateCanvas(body.angleRad);
        this.graphics.fillRect(
          -body.halfWidth,
          -body.halfHeight,
          body.halfWidth * 2,
          body.halfHeight * 2,
        );
        this.graphics.strokeRect(
          -body.halfWidth,
          -body.halfHeight,
          body.halfWidth * 2,
          body.halfHeight * 2,
        );
        this.graphics.restore();
      }
    }
  }
}
