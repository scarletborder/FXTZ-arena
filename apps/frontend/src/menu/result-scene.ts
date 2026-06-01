import Phaser from "phaser";
import { t } from "@repo/i18n";

import { createFightButton, drawFightingBackdrop, drawPanel, bodyStyle, headingStyle } from "./ui";
import { installMenuAudioUnlock, type ResultData, type ResultPlayerSummary, type SceneKey } from "./shared";
import { uiSettings } from "../store/settings";

export class ResultScene extends Phaser.Scene {
  constructor() {
    super("result" satisfies SceneKey);
  }

  create(data: ResultData): void {
    installMenuAudioUnlock(this);
    drawFightingBackdrop(this, "RESULT", "MATCH END");
    this.add.text(438, 112, t("result.title"), headingStyle(46));
    drawPanel(this, 350, 184, 580, 350, t("result.stats"));
    this.add.text(420, 244, t("result.winner", { name: data.winnerName ?? uiSettings.username }), bodyStyle("#ffcf6e", 24));
    this.add.text(420, 304, t("result.duration", { seconds: (data.durationSeconds ?? 0).toFixed(1) }), bodyStyle("#d7e3ef", 20));
    this.add.rectangle(640, 428, 2, 150, 0x41546d, 0.9);
    this.drawPlayerColumn(490, 352, data.players[0]);
    this.drawPlayerColumn(790, 352, data.players[1]);

    createFightButton(this, 512, 588, 260, 58, t("result.back"), () => this.scene.start(data.returnScene ?? "battle-start"), { accent: 0xe33d44 });
    createFightButton(this, 810, 588, 220, 58, t("result.rematch"), undefined, { enabled: false, subLabel: t("result.rematch_disabled") });
  }

  private drawPlayerColumn(centerX: number, topY: number, player: ResultPlayerSummary): void {
    this.add.text(centerX, topY, player.name, bodyStyle("#f6f1e6", 22)).setOrigin(0.5, 0);
    this.add.text(centerX - 110, topY + 42, t("result.shots", { count: player.shots }), bodyStyle("#d7e3ef", 18));
    this.add.text(centerX - 110, topY + 82, t("result.bomb_uses", { count: player.bombUses }), bodyStyle("#d7e3ef", 18));
    this.add.text(centerX - 110, topY + 122, t("result.hits_taken", { count: player.hitsTaken }), bodyStyle("#d7e3ef", 18));
  }
}
