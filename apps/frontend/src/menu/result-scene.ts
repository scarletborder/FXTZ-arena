import Phaser from "phaser";

import { createFightButton, drawFightingBackdrop, drawPanel, bodyStyle, headingStyle } from "./ui";
import { uiSettings, type ResultData, type SceneKey } from "./shared";

export class ResultScene extends Phaser.Scene {
  constructor() {
    super("result" satisfies SceneKey);
  }

  create(data: ResultData): void {
    drawFightingBackdrop(this, "RESULT", "MATCH END");
    this.add.text(438, 112, "结算", headingStyle(46));
    drawPanel(this, 350, 184, 580, 302, "战斗统计");
    this.add.text(420, 244, `胜利方：${data.winnerName ?? uiSettings.username}`, bodyStyle("#ffcf6e", 24));
    this.add.text(420, 304, `对战时间：${(data.durationSeconds ?? 0).toFixed(1)} 秒`, bodyStyle("#d7e3ef", 20));
    this.add.text(420, 356, `射击 ${data.shots ?? 0}    命中 ${data.hits ?? 0}`, bodyStyle("#d7e3ef", 20));
    this.add.text(420, 408, `bomb 使用 ${data.bombUses ?? 0}    死亡 ${data.deaths ?? 0}`, bodyStyle("#d7e3ef", 20));

    createFightButton(this, 512, 558, 260, 58, "返回开始战斗", () => this.scene.start(data.returnScene ?? "battle-start"), { accent: 0xe33d44 });
    createFightButton(this, 810, 558, 220, 58, "再战", undefined, { enabled: false, subLabel: "后续加入" });
  }
}

