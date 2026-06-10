import Phaser from "phaser";
import { t } from "@repo/i18n";

import { prepareResourcePackSource, type ResourcePackPrepareProgress } from "../utils/resource-pack";
import { bodyStyle, drawAngledPanel, drawFightingBackdrop, headingStyle } from "./ui";
import type { SceneKey } from "./shared";

const BAR_WIDTH = 520;

export class BootstrapScene extends Phaser.Scene {
  private progress = 0;
  private label: Phaser.GameObjects.Text | undefined;
  private sizeLabel: Phaser.GameObjects.Text | undefined;
  private enterPrompt: Phaser.GameObjects.Text | undefined;
  private bar: Phaser.GameObjects.Graphics | undefined;
  private finished = false;
  private readyForEntry = false;

  constructor() {
    super("bootstrap" satisfies SceneKey);
  }

  create(): void {
    drawFightingBackdrop(this, "BOOTSTRAP", "RESOURCE CHECK");
    this.add.text(380, 256, t("bootstrap.title"), headingStyle(34));
    this.label = this.add.text(392, 326, t("bootstrap.checking"), bodyStyle("#d7e3ef", 20));
    this.sizeLabel = this.add.text(392, 396, t("bootstrap.size_unknown"), bodyStyle("#9fb4c8", 16));
    this.bar = this.add.graphics();
    this.renderProgress();
    this.input.once("pointerup", () => this.enterGame());

    void this.prepareResources();
  }

  private async prepareResources(): Promise<void> {
    try {
      await prepareResourcePackSource((progress) => this.handleProgress(progress));
      this.handleProgress({ stage: "ready" });
      this.showEnterPrompt();
    } catch (error) {
      console.warn("Resource pack cache unavailable:", error);
      this.label?.setText(t("bootstrap.error"));
      this.sizeLabel?.setText(t("bootstrap.continue_with_network"));
      this.progress = 1;
      this.renderProgress();
      this.showEnterPrompt();
    }
  }

  private handleProgress(progress: ResourcePackPrepareProgress): void {
    if (!this.scene.isActive()) {
      return;
    }

    if (progress.stage === "checking") {
      this.label?.setText(t("bootstrap.checking"));
      this.sizeLabel?.setText(t("bootstrap.size_unknown"));
      this.progress = 0;
    } else if (progress.stage === "downloading") {
      const downloadedBytes = progress.downloadedBytes ?? 0;
      const totalBytes = progress.totalBytes;
      this.label?.setText(t("bootstrap.downloading"));
      this.sizeLabel?.setText(t("bootstrap.download_size", {
        downloaded: formatBytes(downloadedBytes),
        total: totalBytes ? formatBytes(totalBytes) : t("bootstrap.unknown_total"),
      }));
      this.progress = totalBytes ? Math.min(1, downloadedBytes / totalBytes) : 0.12;
    } else if (progress.stage === "fallback") {
      this.label?.setText(t("bootstrap.fallback"));
      this.sizeLabel?.setText(t("bootstrap.size_unknown"));
      this.progress = 1;
    } else if (progress.stage === "ready") {
      this.label?.setText(t("bootstrap.ready"));
      if (progress.downloadedBytes !== undefined && progress.totalBytes !== undefined) {
        this.sizeLabel?.setText(t("bootstrap.download_size", {
          downloaded: formatBytes(progress.downloadedBytes),
          total: formatBytes(progress.totalBytes),
        }));
      }
      this.progress = 1;
    } else {
      this.label?.setText(t("bootstrap.error"));
      this.progress = 1;
    }

    this.renderProgress();
  }

  private renderProgress(): void {
    if (!this.bar) return;
    this.bar.clear();
    drawAngledPanel(this.bar, 380, 362, BAR_WIDTH, 34, 0x101820, 0x5c7185, 1);
    this.bar
      .fillStyle(0x34d399, 1)
      .fillRect(394, 373, (BAR_WIDTH - 28) * this.progress, 12);
  }

  private showEnterPrompt(): void {
    if (this.readyForEntry) {
      return;
    }
    this.readyForEntry = true;
    this.enterPrompt = this.add.text(640, 524, t("bootstrap.tap_to_enter"), {
      ...bodyStyle("#ffcf6e", 20),
      fontStyle: "700",
    }).setOrigin(0.5);
    this.tweens.add({
      targets: this.enterPrompt,
      alpha: 0.28,
      duration: 620,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });
  }

  private enterGame(): void {
    if (!this.readyForEntry || this.finished) {
      this.input.once("pointerup", () => this.enterGame());
      return;
    }
    this.finished = true;
    this.sound.unlock();
    this.scene.start("home");
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(value >= 10 ? 1 : 2)} ${units[unitIndex]}`;
}
