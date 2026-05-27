import Phaser from "phaser";

import { bodyStyle, createFightButton, drawBuildLabel, drawFightingBackdrop, drawTitleBlock } from "./ui";
import type { SelectionData, SceneKey } from "./shared";

export class HomeScene extends Phaser.Scene {
  constructor() {
    super("home" satisfies SceneKey);
  }

  create(): void {
    drawFightingBackdrop(this, "FXTZ ARENA", "LOCAL M5 BUILD");
    drawTitleBlock(this, "FXTZ ARENA", "幻想突战 - 弹幕格斗演武");

    const buttons = [
      { label: "开始战斗", onClick: () => this.scene.start("battle-start") },
      { label: "靶场", onClick: () => this.scene.start("select", { mode: "training" } satisfies SelectionData) },
      { label: "图鉴", onClick: () => this.scene.start("codex") },
      { label: "关于", onClick: () => window.open("https://blog.scarletborder.cn/2026/05/fxtz-arena.html", "_blank", "noopener,noreferrer") },
      { label: "设置", onClick: () => this.scene.start("settings") },
    ];

    buttons.forEach((button, index) => {
      createFightButton(this, 642, 286 + index * 78, 310, 58, button.label, button.onClick);
    });

    this.add.text(1254, 674, "本游戏使用AI绘图，AI编码", {
      ...bodyStyle("#9fb4c8", 14),
      align: "right",
    }).setOrigin(1, 1).setAlpha(0.82);
    drawBuildLabel(this);
  }
}
