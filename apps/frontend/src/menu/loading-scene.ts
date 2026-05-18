import Phaser from "phaser";

import { drawAngledPanel, drawFightingBackdrop, headingStyle, bodyStyle } from "./ui";
import type { LoadingData, SceneKey } from "./shared";

export class LoadingScene extends Phaser.Scene {
  private progress = 0;
  private loadingData!: LoadingData;
  private bar!: Phaser.GameObjects.Graphics;
  private label!: Phaser.GameObjects.Text;

  constructor() {
    super("loading" satisfies SceneKey);
  }

  create(data: LoadingData): void {
    this.loadingData = data;
    this.progress = 0;
    drawFightingBackdrop(this, "LOADING", "READY");
    this.add.text(434, 278, "加载战局资源", headingStyle(34));
    this.label = this.add.text(444, 342, "本地资源检查中", bodyStyle("#d7e3ef", 20));
    this.bar = this.add.graphics();
  }

  update(_: number, delta: number): void {
    this.progress = Math.min(1, this.progress + delta / 1250);
    this.bar.clear();
    drawAngledPanel(this.bar, 436, 394, 410, 34, 0x101820, 0x5c7185, 1);
    this.bar.fillStyle(0xe33d44, 1).fillRect(450, 405, 382 * this.progress, 12);
    if (this.progress > 0.64) {
      this.label.setText(this.loadingData.mode === "ai" ? "等待对手加载中" : "靶场初始化中");
    }
    if (this.progress >= 1) {
      this.scene.start("battle", this.loadingData);
    }
  }
}

