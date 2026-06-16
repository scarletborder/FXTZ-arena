import Phaser from "phaser";
import { t } from "@repo/i18n";
import type { CollaborateExtraState } from "@repo/types";
import { GAME_HEIGHT, GAME_WIDTH } from "@repo/constants";

import { Depth } from "../../../utils/depth";
import type { CanonicalFighterKey } from "../../../network/combat/types";

export class CollaborateTransitionDialog {
  private container: Phaser.GameObjects.Container | undefined;
  private label: Phaser.GameObjects.Text | undefined;
  private button: Phaser.GameObjects.Container | undefined;
  private buttonBg: Phaser.GameObjects.Rectangle | undefined;
  private buttonText: Phaser.GameObjects.Text | undefined;
  private readyProgressBg: Phaser.GameObjects.Rectangle | undefined;
  private readyProgressFill: Phaser.GameObjects.Rectangle | undefined;
  private readyHoldProgress = 0;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly onReady: () => void,
  ) {}

  update(
    extra: CollaborateExtraState | undefined,
    localKey: CanonicalFighterKey,
  ): void {
    if (
      !extra ||
      extra.state !== "transition_sync" ||
      extra.transitionType !== "manual"
    ) {
      this.destroy();
      return;
    }

    this.ensure();
    const readyCount =
      (extra.player1TransitionReady ? 1 : 0) +
      (extra.player2TransitionReady ? 1 : 0);
    const target =
      extra.pendingTransitionTarget === "boss"
        ? t("battle.transition_target_boss")
        : t("battle.transition_target_elite");
    const localReady =
      localKey === "Player1"
        ? extra.player1TransitionReady
        : extra.player2TransitionReady;

    this.label?.setText(
      t("battle.transition_ready_prompt", {
        target,
        ready: readyCount,
      }),
    );
    this.buttonText?.setText(
      localReady
        ? t("battle.transition_ready_done")
        : t("battle.transition_ready_button"),
    );
    this.buttonBg?.setFillStyle(localReady ? 0x50606a : 0xe33d44, 1);
    this.button?.setAlpha(localReady ? 0.55 : 1);
    this.renderReadyProgress(localReady);
    this.container?.setVisible(true);
  }

  setReadyHoldProgress(progress: number): void {
    this.readyHoldProgress = Phaser.Math.Clamp(progress, 0, 1);
  }

  destroy(): void {
    this.container?.destroy();
    this.container = undefined;
    this.label = undefined;
    this.button = undefined;
    this.buttonBg = undefined;
    this.buttonText = undefined;
    this.readyProgressBg = undefined;
    this.readyProgressFill = undefined;
    this.readyHoldProgress = 0;
  }

  private ensure(): void {
    if (this.container) {
      return;
    }

    const container = this.scene.add
      .container(GAME_WIDTH / 2, GAME_HEIGHT / 2)
      .setScrollFactor(0)
      .setDepth(Depth.OnlineStatus + 1);
    container.setAlpha(0).setScale(0.96);
    this.scene.tweens.add({
      targets: container,
      alpha: 1,
      scale: 1,
      duration: 360,
      ease: "Cubic.easeOut",
    });
    const bg = this.scene.add
      .rectangle(0, 0, 420, 170, 0x101820, 0.92)
      .setStrokeStyle(2, 0xffcf6e, 0.95);
    const label = this.scene.add
      .text(0, -38, "", {
        fontFamily: "Arial",
        fontSize: "22px",
        color: "#f6f1e6",
        align: "center",
      })
      .setOrigin(0.5);
    const button = this.scene.add.container(0, 42);
    const buttonBg = this.scene.add
      .rectangle(0, 0, 132, 44, 0xe33d44, 1)
      .setStrokeStyle(1, 0xffffff, 0.55);
    const buttonText = this.scene.add
      .text(0, 0, "", {
        fontFamily: "Arial",
        fontSize: "18px",
        fontStyle: "700",
        color: "#ffffff",
      })
      .setOrigin(0.5);
    const readyProgressBg = this.scene.add
      .rectangle(0, 69, 132, 5, 0x071018, 0.95)
      .setOrigin(0.5)
      .setStrokeStyle(1, 0xffffff, 0.18);
    const readyProgressFill = this.scene.add
      .rectangle(-66, 69, 0, 5, 0xffcf6e, 1)
      .setOrigin(0, 0.5);
    button.add([buttonBg, buttonText]);
    button.setSize(132, 44);
    button.setInteractive(
      new Phaser.Geom.Rectangle(-66, -22, 132, 44),
      Phaser.Geom.Rectangle.Contains,
    );
    button.on("pointerdown", () => this.onReady());
    container.add([bg, label, button, readyProgressBg, readyProgressFill]);

    this.container = container;
    this.label = label;
    this.button = button;
    this.buttonBg = buttonBg;
    this.buttonText = buttonText;
    this.readyProgressBg = readyProgressBg;
    this.readyProgressFill = readyProgressFill;
  }

  private renderReadyProgress(ready: boolean): void {
    const visible = !ready && this.readyHoldProgress > 0;
    this.readyProgressBg?.setVisible(visible);
    this.readyProgressFill?.setVisible(visible);
    this.readyProgressFill?.setSize(132 * this.readyHoldProgress, 5);
  }
}
