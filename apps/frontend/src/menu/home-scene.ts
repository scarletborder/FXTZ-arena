import Phaser from "phaser";
import { t } from "@repo/i18n";

import { bodyStyle, createFightButton, drawBuildLabel, drawFightingBackdrop, drawTitleBlock } from "./ui";
import { installMenuAudioUnlock, type SelectionData, type SceneKey } from "./shared";
import { showPublicServerConnectivityDialog } from "./public-server-connectivity-dialog";
import { setSelfAuthed, uiSettings } from "../store/settings";
import { showLanguageDialog } from "./language-dialog";

export class HomeScene extends Phaser.Scene {
  private publicServerConnectivityDialog: Phaser.GameObjects.Container | undefined;

  constructor() {
    super("home" satisfies SceneKey);
  }

  create(): void {
    installMenuAudioUnlock(this);
    drawFightingBackdrop(this, "FXTZ ARENA", "LOCAL M5 BUILD");
    drawTitleBlock(this, "FXTZ ARENA", t("menu.subtitle"));

    const buttons = [
      { label: t("menu.start_game"), onClick: () => this.scene.start("battle-start") },
      { label: t("menu.practice_range"), onClick: () => this.scene.start("select", { mode: "training" } satisfies SelectionData) },
      { label: t("menu.codex"), onClick: () => this.scene.start("codex") },
      { label: t("menu.about"), onClick: () => window.open("https://blog.scarletborder.cn/2026/05/fxtz-arena.html", "_blank", "noopener,noreferrer") },
      { label: t("menu.settings"), onClick: () => this.scene.start("settings") },
    ];

    buttons.forEach((button, index) => {
      createFightButton(this, 642, 286 + index * 78, 310, 58, button.label, button.onClick);
    });

    this.add.text(1254, 674, t("menu.ai_declaration"), {
      ...bodyStyle("#9fb4c8", 14),
      align: "right",
    }).setOrigin(1, 1).setAlpha(0.82);
    this.createLanguageIcon();
    drawBuildLabel(this);
    this.showPublicServerConnectivityDialog();
  }

  private showPublicServerConnectivityDialog(): void {
    if (uiSettings.selfAuthed || this.publicServerConnectivityDialog) {
      return;
    }
    this.publicServerConnectivityDialog = showPublicServerConnectivityDialog(this, {
      onClose: () => {
        setSelfAuthed(true);
        this.publicServerConnectivityDialog = undefined;
      },
    });
  }

  private createLanguageIcon(): void {
    const size = 28;
    const x = 1218;
    const y = 636;
    let hovering = false;
    const container = this.add.container(x, y);
    const background = this.add.graphics();
    const globe = this.add.graphics();
    const hitArea = this.add.rectangle(0, 0, size, size, 0xffffff, 0.001).setOrigin(0, 0).setInteractive({ useHandCursor: true });

    const draw = () => {
      background.clear();
      background.fillStyle(hovering ? 0x252e3d : 0x151b26, 1).fillCircle(size / 2, size / 2, 14);
      background.lineStyle(2, hovering ? 0xffcf6e : 0x5c7185, 1).strokeCircle(size / 2, size / 2, 14);
      globe.clear();
      globe.lineStyle(1.4, hovering ? 0xffcf6e : 0xd7e3ef, 1);
      globe.strokeCircle(size / 2, size / 2, 8);
      globe.lineBetween(14, 6, 14, 22);
      globe.lineBetween(8, 14, 20, 14);
      globe.lineBetween(10, 9, 18, 19);
      globe.lineBetween(10, 19, 18, 9);
    };

    hitArea.on("pointerover", () => { hovering = true; draw(); });
    hitArea.on("pointerout", () => { hovering = false; draw(); });
    hitArea.on("pointerup", () => showLanguageDialog(this));
    container.add([background, globe, hitArea]);
    draw();
  }
}
