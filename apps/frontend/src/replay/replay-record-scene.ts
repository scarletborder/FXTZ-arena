import Phaser from "phaser";
import { t } from "@repo/i18n";

import { installMenuAudioUnlock } from "../menu/shared";
import {
  bodyStyle,
  createFightButton,
  createRectangleButton,
  drawFightingBackdrop,
  headingStyle,
} from "../menu/ui";
import type { ReplayFile, ReplayRecordData } from "./types";
import { SLOTS_PER_PAGE } from "./types";
import {
  downloadReplay,
  formatSlotTime,
  getPageCount,
  listSlotsForPage,
  saveReplay,
} from "./storage";

interface DialogState {
  readonly layer: Phaser.GameObjects.Container;
  cleanup(): void;
}

export class ReplayRecordScene extends Phaser.Scene {
  private replay: ReplayFile | undefined;
  private currentPage = 0;
  private dialog: DialogState | undefined;
  private titleInputValue = "";
  private renderGen = 0;
  private returnScene: import("../menu/shared").SceneKey = "battle-start";

  constructor() {
    super("replay-record");
  }

  init(data: ReplayRecordData): void {
    this.replay = data.replay;
    this.currentPage = data.currentPage ?? 0;
    this.returnScene = data.returnScene ?? "battle-start";
  }

  create(): void {
    installMenuAudioUnlock(this);
    this.dialog = undefined;
    this.titleInputValue = "";
    this.renderPage();
  }

  private async renderPage(): Promise<void> {
    const gen = ++this.renderGen;
    this.children.removeAll(true);
    drawFightingBackdrop(this, "REPLAY", "SAVE");
    this.add.text(90, 34, t("replay.save_title"), headingStyle(38));
    this.add.text(90, 80, t("replay.save_hint"), bodyStyle("#b7c7d8", 16));

    const panelX = 90;
    const panelY = 118;
    const rowHeight = 34;
    const panelWidth = 1100;

    // Draw panel background
    const panel = this.add.graphics();
    panel.fillStyle(0x0b1118, 0.88);
    panel.fillRoundedRect(panelX - 10, panelY - 10, panelWidth, rowHeight * SLOTS_PER_PAGE + 20, 6);
    panel.lineStyle(1, 0x34475c, 0.72);
    panel.strokeRoundedRect(panelX - 10, panelY - 10, panelWidth, rowHeight * SLOTS_PER_PAGE + 20, 6);
    panel.setDepth(0);

    // Header row
    this.add.text(panelX + 10, panelY - 6, "#", bodyStyle("#6e8496", 13)).setDepth(1);
    this.add.text(panelX + 50, panelY - 6, t("replay.col_title"), bodyStyle("#6e8496", 13)).setDepth(1);
    this.add.text(panelX + 500, panelY - 6, t("replay.col_time"), bodyStyle("#6e8496", 13)).setDepth(1);
    this.add.text(panelX + 885, panelY - 6, t("replay.col_action"), bodyStyle("#6e8496", 13)).setDepth(1);

    // Async load slot data
    const slots = await listSlotsForPage(this.currentPage);
    if (this.renderGen !== gen) return;

    for (let i = 0; i < SLOTS_PER_PAGE; i += 1) {
      const slotIndex = this.currentPage * SLOTS_PER_PAGE + i;
      const baseY = panelY + 16 + i * rowHeight;
      const y = baseY + 8;
      const slot = slots[i];

      // Slot number
      this.add.text(panelX + 10, baseY, `${slotIndex + 1}`, bodyStyle("#5c7185", 14)).setDepth(1);

      // Divider line
      if (i > 0) {
        const line = this.add.graphics();
        line.lineStyle(1, 0x1d2b36, 0.6);
        line.lineBetween(panelX, baseY - 2, panelX + panelWidth - 20, baseY - 2);
        line.setDepth(0);
      }

      if (slot) {
        // Title - clickable for overwrite
        this.add.text(
          panelX + 50, y,
          slot.title.length > 28 ? `${slot.title.slice(0, 26)}...` : slot.title,
          bodyStyle("#ffcf6e", 15),
        ).setDepth(1);
        const titleHit = this.add.rectangle(
          panelX + 50, y + 8,
          380, rowHeight - 4,
          0xffffff, 0.001,
        ).setInteractive({ useHandCursor: true }).setDepth(2);
        titleHit.on("pointerup", () => this.showOverwriteDialog(slotIndex));

        // Time
        this.add.text(panelX + 500, y, formatSlotTime(slot.timestamp), bodyStyle("#d7e3ef", 14)).setDepth(1);

        // Mode badge
        const modeLabel = t(`replay.mode_${slot.mode}` as any) ?? slot.mode;
        this.add.text(panelX + 740, y, modeLabel, bodyStyle("#5c7185", 12)).setDepth(1);

        // Download text link
        const downloadLink = this.add.text(panelX + 885, y, t("replay.download"), bodyStyle("#26c6da", 14))
          .setInteractive({ useHandCursor: true }).setDepth(2);
        downloadLink.on("pointerover", () => downloadLink.setColor("#80e5f0"));
        downloadLink.on("pointerout", () => downloadLink.setColor("#26c6da"));
        downloadLink.on("pointerup", () => downloadReplay(slotIndex));

      } else {
        // Empty slot - clickable
        this.add.text(panelX + 50, y, "-", bodyStyle("#34475c", 18)).setDepth(1);
        const emptyHit = this.add.rectangle(
          panelX + 50, y + 8,
          380, rowHeight - 4,
          0xffffff, 0.001,
        ).setInteractive({ useHandCursor: true }).setDepth(2);
        emptyHit.on("pointerup", () => this.showTitleInputDialog(slotIndex));
      }
    }

    // Pagination
    const pageCount = getPageCount();
    if (pageCount > 1) {
      const pagY = panelY + SLOTS_PER_PAGE * rowHeight + 40;
      if (this.currentPage > 0) {
        createRectangleButton(
          this, 980, pagY - 8, 80, 26,
          t("replay.prev_page"),
          () => { this.currentPage = Math.max(0, this.currentPage - 1); this.renderPage(); },
          { accent: 0x5c7185 },
        );
      }
      this.add.text(1040, pagY - 12, t("replay.page", { page: this.currentPage + 1, total: pageCount }), bodyStyle("#b7c7d8", 14)).setDepth(1);
      if (this.currentPage < pageCount - 1) {
        createRectangleButton(
          this, 1180, pagY - 8, 80, 26,
          t("replay.next_page"),
          () => { this.currentPage = Math.min(pageCount - 1, this.currentPage + 1); this.renderPage(); },
          { accent: 0x5c7185 },
        );
      }
    }

    // Skip button
    createFightButton(
      this, 1100, 56, 140, 42,
      t("replay.skip"),
      () => {
        this.scene.start(this.returnScene);
      },
      { accent: 0x5c7185 },
    );
  }

  private showOverwriteDialog(slotIndex: number): void {
    this.closeDialog();
    const layer = this.add.container(0, 0).setDepth(100);
    const veil = this.add.rectangle(640, 360, 1280, 720, 0x000000, 0.7).setInteractive();
    veil.on("pointerup", () => this.closeDialog());
    layer.add(veil);

    const panel = this.add.graphics();
    panel.fillStyle(0x101820, 0.96);
    panel.fillRoundedRect(380, 240, 520, 200, 8);
    panel.lineStyle(2, 0xffcf6e, 0.8);
    panel.strokeRoundedRect(380, 240, 520, 200, 8);
    layer.add(panel);

    // Blocker to prevent veil from closing when clicking inside the panel
    const blocker = this.add.rectangle(640, 340, 520, 200, 0xffffff, 0.001)
      .setInteractive();
    layer.add(blocker);

    const msg = this.add.text(640, 290, t("replay.overwrite_confirm"), {
      fontFamily: "Arial, 'Microsoft YaHei', sans-serif",
      fontSize: "20px",
      fontStyle: "900",
      color: "#f6f1e6",
      align: "center",
    }).setOrigin(0.5);
    layer.add(msg);

    const cancelBtn = createFightButton(this, 520, 388, 140, 42, t("replay.cancel"), () => this.closeDialog(), { accent: 0x5c7185 });
    layer.add(cancelBtn.container);
    const confirmBtn = createFightButton(this, 720, 388, 140, 42, t("replay.confirm"), () => {
      this.closeDialog();
      this.showTitleInputDialog(slotIndex);
    }, { accent: 0xe33d44 });
    layer.add(confirmBtn.container);

    this.dialog = {
      layer,
      cleanup: () => this.closeDialog(),
    };
  }

  private showTitleInputDialog(slotIndex: number): void {
    this.closeDialog();
    this.titleInputValue = this.replay?.title ?? "";

    const layer = this.add.container(0, 0).setDepth(100);
    const veil = this.add.rectangle(640, 360, 1280, 720, 0x000000, 0.7).setInteractive();
    veil.on("pointerup", () => this.closeDialog());
    layer.add(veil);

    const panel = this.add.graphics();
    panel.fillStyle(0x101820, 0.96);
    panel.fillRoundedRect(340, 200, 600, 300, 8);
    panel.lineStyle(2, 0xffcf6e, 0.8);
    panel.strokeRoundedRect(340, 200, 600, 300, 8);
    layer.add(panel);

    // Blocker to prevent veil from closing when clicking inside the panel
    const blocker = this.add.rectangle(640, 350, 600, 300, 0xffffff, 0.001)
      .setInteractive();
    layer.add(blocker);

    const titleLabel = this.add.text(640, 240, t("replay.title_input"), {
      fontFamily: "Arial, 'Microsoft YaHei', sans-serif",
      fontSize: "20px",
      fontStyle: "900",
      color: "#f6f1e6",
    }).setOrigin(0.5);
    layer.add(titleLabel);

    // Text input background
    const inputBg = this.add.graphics();
    inputBg.fillStyle(0x080b10, 1);
    inputBg.fillRoundedRect(400, 275, 480, 40, 4);
    inputBg.lineStyle(1, 0x5c7185, 0.8);
    inputBg.strokeRoundedRect(400, 275, 480, 40, 4);
    layer.add(inputBg);

    const inputText = this.add.text(410, 285, this.titleInputValue || t("replay.title_placeholder"), {
      fontFamily: "Arial, 'Microsoft YaHei', sans-serif",
      fontSize: "18px",
      color: this.titleInputValue ? "#f6f1e6" : "#5c7185",
    }).setDepth(1);
    layer.add(inputText);

    // Handle keyboard input
    const keyboardHandler = (event: KeyboardEvent): void => {
      if (event.key === "Enter") {
        this.confirmSave(slotIndex);
        return;
      }
      if (event.key === "Escape") {
        this.closeDialog();
        return;
      }
      if (event.key === "Backspace") {
        this.titleInputValue = this.titleInputValue.slice(0, -1);
      } else if (event.key.length === 1 && this.titleInputValue.length < 30) {
        this.titleInputValue += event.key;
      }
      inputText.setText(this.titleInputValue || t("replay.title_placeholder"));
      inputText.setColor(this.titleInputValue ? "#f6f1e6" : "#5c7185");
    };
    this.input.keyboard?.on("keydown", keyboardHandler);

    // Back button
    const backBtn = createFightButton(this, 520, 440, 140, 42, t("replay.back"), () => {
      this.input.keyboard?.off("keydown", keyboardHandler);
      this.closeDialog();
    }, { accent: 0x5c7185 });
    layer.add(backBtn.container);

    // Confirm button
    const confirmBtn = createFightButton(this, 720, 440, 140, 42, t("replay.confirm"), () => {
      this.input.keyboard?.off("keydown", keyboardHandler);
      this.confirmSave(slotIndex);
    }, { accent: 0xe33d44 });
    layer.add(confirmBtn.container);

    this.dialog = {
      layer,
      cleanup: () => {
        this.input.keyboard?.off("keydown", keyboardHandler);
        this.closeDialog();
      },
    };
  }

  private async confirmSave(slotIndex: number): Promise<void> {
    const title = this.titleInputValue.trim() || this.replay?.title || t("replay.default_title");
    if (!this.replay) {
      this.scene.start(this.returnScene);
      return;
    }
    const replayWithTitle: ReplayFile = {
      ...this.replay,
      title,
    };
    await saveReplay(slotIndex, replayWithTitle);
    this.closeDialog();
    this.scene.start(this.returnScene);
  }

  private closeDialog(): void {
    this.dialog?.layer.destroy(true);
    this.dialog = undefined;
  }
}
