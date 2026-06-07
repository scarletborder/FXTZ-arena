import Phaser from "phaser";
import { t } from "@repo/i18n";
import { GAME_HEIGHT } from "@repo/constants";

import { createFightButton, drawFightingBackdrop, drawPanel, bodyStyle, headingStyle } from "./ui";
import { installMenuAudioUnlock, type ResultData, type ResultPlayerSummary, type SceneKey } from "./shared";
import { Depth } from "../utils/depth";
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

    const hasReplay = data.replay !== undefined;

    createFightButton(this, 512, 588, 260, 58, t("result.back"), () => {
      if (hasReplay && data.replay) {
        this.scene.start("replay-record", { replay: data.replay });
      } else {
        this.scene.start(data.returnScene ?? "battle-start");
      }
    }, { accent: 0xe33d44 });
    createFightButton(this, 810, 588, 220, 58, t("result.rematch"), undefined, { enabled: false, subLabel: t("result.rematch_disabled") });

    if (uiSettings.debug && data.debugHashes) {
      this.drawDebugHashPanel(data.debugHashes);
    }
  }

  private drawPlayerColumn(centerX: number, topY: number, player: ResultPlayerSummary): void {
    this.add.text(centerX, topY, player.name, bodyStyle("#f6f1e6", 22)).setOrigin(0.5, 0);
    this.add.text(centerX - 110, topY + 42, t("result.shots", { count: player.shots }), bodyStyle("#d7e3ef", 18));
    this.add.text(centerX - 110, topY + 82, t("result.bomb_uses", { count: player.bombUses }), bodyStyle("#d7e3ef", 18));
    this.add.text(centerX - 110, topY + 122, t("result.hits_taken", { count: player.hitsTaken }), bodyStyle("#d7e3ef", 18));
  }

  private drawDebugHashPanel(debugHashes: NonNullable<ResultData["debugHashes"]>): void {
    const panelX = 20;
    const panelY = GAME_HEIGHT - 20;
    const panelWidth = 430;
    const panelHeight = 74;

    this.add
      .rectangle(panelX, panelY, panelWidth, panelHeight, 0x101820, 0.82)
      .setOrigin(0, 1)
      .setScrollFactor(0)
      .setDepth(Depth.Debug);

    this.add
      .text(
        panelX + 14,
        panelY - 14,
        [
          `finalGlobalHash: ${debugHashes.finalGlobalHash ?? "<incomplete>"}`,
          `finalGlobalInputHash: ${debugHashes.finalGlobalInputHash ?? "<incomplete>"}`,
        ].join("\n"),
        bodyStyle("#d7e3ef", 15),
      )
      .setOrigin(0, 1)
      .setDepth(Depth.Debug)
      .setScrollFactor(0);
  }
}
