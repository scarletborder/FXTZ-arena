import Phaser from "phaser";

import { createBackButton, createFightButton, drawFightingBackdrop, drawPanel } from "./ui";
import type { SceneKey, SelectionData } from "./shared";

export class BattleStartScene extends Phaser.Scene {
  constructor() {
    super("battle-start" satisfies SceneKey);
  }

  create(): void {
    drawFightingBackdrop(this, "BATTLE", "VERSUS ENTRY");
    createBackButton(this);
    this.add.text(90, 74, "开始战斗", {
      fontFamily: "Arial, 'Microsoft YaHei', sans-serif",
      fontSize: "42px",
      fontStyle: "900",
      color: "#f6f1e6",
    });
    this.add.text(92, 126, "联机入口保留展示；本地模式已开放。", bodyStyle("#b7c7d8", 18));

    drawPanel(this, 72, 176, 520, 432, "ONLINE");
    drawPanel(this, 686, 176, 520, 432, "LOCAL");

    createFightButton(this, 332, 272, 330, 70, "快速匹配", undefined, { enabled: false, subLabel: "待联机服务接入" });
    createFightButton(this, 332, 374, 330, 70, "创建房间", undefined, { enabled: false, subLabel: "服务器连接后启用" });
    createFightButton(this, 332, 476, 330, 70, "房间列表", undefined, { enabled: false, subLabel: "M5 占位" });

    createFightButton(this, 946, 318, 360, 86, "人机对战", () => this.scene.start("select", { mode: "ai" } satisfies SelectionData), {
      subLabel: "选择配装后开战",
      accent: 0xe33d44,
    });
    createFightButton(this, 946, 446, 360, 86, "靶场", () => this.scene.start("select", { mode: "training" } satisfies SelectionData), {
      subLabel: "无 cost 上限",
      accent: 0x26c6da,
    });
  }
}

function bodyStyle(color: string, size: number): Phaser.Types.GameObjects.Text.TextStyle {
  return {
    fontFamily: "Arial, 'Microsoft YaHei', sans-serif",
    fontSize: `${size}px`,
    color,
  };
}
