import Phaser from "phaser";
import { t } from "@repo/i18n";
import { APP_VERSION, IS_DESKTOP_APP } from "@repo/constants";

import { prepareResourcePackSource, type ResourcePackPrepareProgress } from "../utils/resource-pack";
import { fetchDesktopRemoteVersion, updateDesktopAppIfNeeded } from "../platform/desktop-updater";
import { bodyStyle, drawAngledPanel, drawFightingBackdrop, headingStyle } from "./ui";
import type { SceneKey } from "./shared";

const BAR_WIDTH = 520;
const UNKNOWN_VERSION = "-";

export class BootstrapScene extends Phaser.Scene {
  private progress = 0;
  private label: Phaser.GameObjects.Text | undefined;
  private sizeLabel: Phaser.GameObjects.Text | undefined;
  private versionLabel: Phaser.GameObjects.Text | undefined;
  private remoteVersion = UNKNOWN_VERSION;
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
    if (IS_DESKTOP_APP) {
      this.versionLabel = this.add.text(1228, 648, "", {
        ...bodyStyle("#9fb4c8", 15),
        align: "right",
        lineSpacing: 6,
      }).setOrigin(1, 0);
      this.updateVersionLabel();
    }
    this.bar = this.add.graphics();
    this.renderProgress();
    this.input.once("pointerup", () => this.enterGame());

    void this.prepareResources();
  }

  private async prepareResources(): Promise<void> {
    try {
      if (IS_DESKTOP_APP) {
        this.setBootstrapStage(t("bootstrap.fetching_remote_version"), t("bootstrap.waiting_remote_version"), 0.04);
        const remoteVersion = await fetchDesktopRemoteVersion();
        if (remoteVersion.status === "available") {
          this.remoteVersion = formatVersionForDisplay(remoteVersion.version);
          this.updateVersionLabel();
        } else {
          this.remoteVersion = t("bootstrap.version_unknown");
          this.updateVersionLabel();
        }

        this.setBootstrapStage(t("bootstrap.checking_desktop_update"), t("bootstrap.current_version", {
          version: APP_VERSION,
        }), 0.08);
        const updateResult = await updateDesktopAppIfNeeded((progress) => {
          this.handleDesktopUpdateProgress(progress.downloadedBytes, progress.totalBytes);
        });
        if (updateResult.status === "updated") {
          return;
        }
        if (updateResult.status === "failed") {
          this.label?.setText(t("bootstrap.update_check_failed"));
          this.sizeLabel?.setText(t("bootstrap.continue_without_update"));
          await delay(1200);
        }
      }

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
      this.label?.setText(t("bootstrap.fetching_resource_manifest"));
      this.sizeLabel?.setText(t("bootstrap.size_unknown"));
      this.progress = 0;
    } else if (progress.stage === "downloading") {
      const downloadedBytes = progress.downloadedBytes ?? 0;
      const totalBytes = progress.totalBytes;
      this.label?.setText(t("bootstrap.updating_resources"));
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

  private handleDesktopUpdateProgress(downloadedBytes = 0, totalBytes?: number): void {
    this.label?.setText(t("bootstrap.updating_desktop_client"));
    this.sizeLabel?.setText(t("bootstrap.download_size", {
      downloaded: formatBytes(downloadedBytes),
      total: totalBytes ? formatBytes(totalBytes) : t("bootstrap.unknown_total"),
    }));
    this.progress = totalBytes ? Math.min(1, downloadedBytes / totalBytes) : 0.12;
    this.renderProgress();
  }

  private setBootstrapStage(label: string, detail: string, progress: number): void {
    this.label?.setText(label);
    this.sizeLabel?.setText(detail);
    this.progress = progress;
    this.renderProgress();
  }

  private updateVersionLabel(): void {
    this.versionLabel?.setText(t("bootstrap.version_info", {
      current: APP_VERSION,
      latest: this.remoteVersion,
    }));
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

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function formatVersionForDisplay(version: string): string {
  return version === "dev" || version.startsWith("v") ? version : `v${version}`;
}
