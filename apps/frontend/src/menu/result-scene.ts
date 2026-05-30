import Phaser from "phaser";

import { createFightButton, drawFightingBackdrop, drawPanel, bodyStyle, headingStyle } from "./ui";
import { type ResultData, type ResultPlayerSummary, type SceneKey } from "./shared";
import { uiSettings } from "../store/settings";

export class ResultScene extends Phaser.Scene {
  constructor() {
    super("result" satisfies SceneKey);
  }

  create(data: ResultData): void {
    drawFightingBackdrop(this, "RESULT", "MATCH END");
    this.add.text(438, 112, "结算", headingStyle(46));
    drawPanel(this, 350, 184, 580, 350, "战斗统计");
    this.add.text(420, 244, `胜利方：${data.winnerName ?? uiSettings.username}`, bodyStyle("#ffcf6e", 24));
    this.add.text(420, 304, `对战时间：${(data.durationSeconds ?? 0).toFixed(1)} 秒`, bodyStyle("#d7e3ef", 20));
    this.add.rectangle(640, 428, 2, 150, 0x41546d, 0.9);
    this.drawPlayerColumn(490, 352, data.players[0]);
    this.drawPlayerColumn(790, 352, data.players[1]);

    createFightButton(this, 512, 588, 260, 58, "返回开始战斗", () => this.scene.start(data.returnScene ?? "battle-start"), { accent: 0xe33d44 });
    createFightButton(this, 810, 588, 220, 58, "再战", undefined, { enabled: false, subLabel: "暂不可用" });
  }

  private drawPlayerColumn(centerX: number, topY: number, player: ResultPlayerSummary): void {
    this.add.text(centerX, topY, player.name, bodyStyle("#f6f1e6", 22)).setOrigin(0.5, 0);
    this.add.text(centerX - 110, topY + 42, `射击：${player.shots}`, bodyStyle("#d7e3ef", 18));
    this.add.text(centerX - 110, topY + 82, `bomb 使用：${player.bombUses}`, bodyStyle("#d7e3ef", 18));
    this.add.text(centerX - 110, topY + 122, `中弹次数：${player.hitsTaken}`, bodyStyle("#d7e3ef", 18));
  }
}
