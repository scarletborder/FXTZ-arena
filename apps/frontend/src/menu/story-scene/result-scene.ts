import Phaser from "phaser";
import { t } from "@repo/i18n";

import type { StoryResultData } from "../../story/types";
import { installMenuAudioUnlock, type SceneKey } from "../shared";
import {
  bodyStyle,
  createFightButton,
  drawFightingBackdrop,
  drawPanel,
  headingStyle,
} from "../ui";

export class StoryResultScene extends Phaser.Scene {
  private resultData: StoryResultData = {};
  private finished = false;
  private scrollLayer: Phaser.GameObjects.Container | undefined;
  private holdTimer: Phaser.Time.TimerEvent | undefined;
  private holdBar: Phaser.GameObjects.Rectangle | undefined;

  constructor() {
    super("story-result" satisfies SceneKey);
  }

  init(data: StoryResultData): void {
    this.resultData = data;
    this.finished = false;
  }

  create(): void {
    installMenuAudioUnlock(this);
    drawFightingBackdrop(this, "STORY", "RESULT");
    if (this.resultData.success === false) {
      this.showStats();
      return;
    }
    this.createStaffRoll();
    this.createSkipHold();
  }

  private createStaffRoll(): void {
    const lines = this.resultData.story?.staff ?? [
      t("story.staff_default_1"),
      t("story.staff_default_2"),
    ];
    const scrollLayer = this.add.container(0, 760);
    this.scrollLayer = scrollLayer;
    lines.forEach((line, index) => {
      const text = this.add
        .text(
          640,
          index * 54,
          line,
          bodyStyle(index === 0 ? "#ffcf6e" : "#f6f1e6", index === 0 ? 28 : 20),
        )
        .setOrigin(0.5);
      scrollLayer.add(text);
    });
    const distance = 820 + lines.length * 54;
    this.tweens.add({
      targets: scrollLayer,
      y: 720 - distance,
      duration: Math.max(9000, lines.length * 1300),
      ease: "Linear",
      onComplete: () => this.showStats(),
    });
  }

  private createSkipHold(): void {
    const button = this.add.container(76, 660);
    button.add(
      this.add
        .rectangle(0, 0, 112, 42, 0x101820, 0.88)
        .setOrigin(0, 0)
        .setStrokeStyle(2, 0x5c7185, 0.8),
    );
    button.add(
      this.add
        .text(56, 11, t("story.skip"), bodyStyle("#d7e3ef", 16))
        .setOrigin(0.5, 0),
    );
    this.holdBar = this.add.rectangle(0, 38, 0, 4, 0xffcf6e, 1).setOrigin(0, 0);
    button.add(this.holdBar);
    const hit = this.add
      .rectangle(0, 0, 112, 42, 0xffffff, 0.001)
      .setOrigin(0, 0)
      .setInteractive({ useHandCursor: true });
    hit.on("pointerdown", () => this.beginSkipHold());
    hit.on("pointerup", () => this.cancelSkipHold());
    hit.on("pointerout", () => this.cancelSkipHold());
    button.add(hit);
  }

  private beginSkipHold(): void {
    this.cancelSkipHold();
    if (!this.holdBar) {
      return;
    }
    this.holdBar.width = 0;
    this.tweens.add({
      targets: this.holdBar,
      width: 112,
      duration: 900,
      ease: "Linear",
    });
    this.holdTimer = this.time.delayedCall(900, () => this.showStats());
  }

  private cancelSkipHold(): void {
    this.holdTimer?.remove(false);
    this.holdTimer = undefined;
    if (this.holdBar) {
      this.tweens.killTweensOf(this.holdBar);
      this.holdBar.width = 0;
    }
  }

  private showStats(): void {
    if (this.finished) {
      return;
    }
    this.finished = true;
    if (this.scrollLayer) {
      this.tweens.killTweensOf(this.scrollLayer);
    }
    this.cancelSkipHold();
    this.children.removeAll(true);
    drawFightingBackdrop(this, "STORY", "COMPLETE");
    const state = this.resultData.state;
    const success = this.resultData.success !== false;
    this.add
      .text(
        640,
        112,
        success ? t("story.result_success") : t("story.result_failed"),
        headingStyle(42),
      )
      .setOrigin(0.5);
    drawPanel(this, 360, 202, 560, 300, t("story.result_stats"));
    this.add.text(
      424,
      260,
      t("story.result_battles", { count: state?.stats.battles ?? 0 }),
      bodyStyle("#d7e3ef", 20),
    );
    this.add.text(
      424,
      304,
      t("story.result_wins", { count: state?.stats.wins ?? 0 }),
      bodyStyle("#d7e3ef", 20),
    );
    this.add.text(
      424,
      348,
      t("story.result_resources", {
        lives: state?.lives ?? 0,
        bombs: state?.bombs ?? 0,
      }),
      bodyStyle("#d7e3ef", 20),
    );
    this.add.text(
      424,
      392,
      t("story.result_actions", {
        shots: state?.stats.shots ?? 0,
        bombs: state?.stats.bombUses ?? 0,
      }),
      bodyStyle("#d7e3ef", 20),
    );
    this.add.text(
      424,
      436,
      t("story.result_hits", { count: state?.stats.hitsTaken ?? 0 }),
      bodyStyle("#d7e3ef", 20),
    );
    createFightButton(
      this,
      640,
      594,
      260,
      58,
      t("story.back_to_menu"),
      () => this.scene.start("battle-start"),
      { accent: 0xe33d44 },
    );
  }
}
