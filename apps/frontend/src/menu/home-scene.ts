import Phaser from "phaser";

import { createFightButton, drawBuildLabel, drawFightingBackdrop, drawTitleBlock } from "./ui";
import type { SelectionData, SelectionMode, SceneKey } from "./shared";

export class HomeScene extends Phaser.Scene {
  constructor() {
    super("home" satisfies SceneKey);
  }

  create(): void {
    drawFightingBackdrop(this, "FXTZ ARENA", "LOCAL M5 BUILD");
    drawTitleBlock(this, "FXTZ ARENA", "幻想突战 - 弹幕格斗演武");

    const buttons = [
      { label: "开始战斗", scene: "battle-start" },
      { label: "靶场", scene: "select", data: { mode: "training" satisfies SelectionMode } },
      { label: "图鉴", scene: "codex" },
      { label: "设置", scene: "settings" },
    ] as const;

    buttons.forEach((button, index) => {
      createFightButton(this, 642, 286 + index * 78, 310, 58, button.label, () => {
        this.scene.start(button.scene, "data" in button ? (button.data as SelectionData) : undefined);
      });
    });

    drawBuildLabel(this);
  }
}
