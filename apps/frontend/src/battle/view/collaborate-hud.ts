import Phaser from "phaser";

import { t } from "@repo/i18n";
import type { FighterKey } from "@repo/raid-logic";
import type { CollaborateExtraState } from "@repo/types";
import { Depth } from "../../utils/depth";

export class CollaborateHud {
  private readonly container: Phaser.GameObjects.Container;
  private readonly scoreText: Phaser.GameObjects.Text;
  private readonly moneyText: Phaser.GameObjects.Text;
  private readonly back: Phaser.GameObjects.Rectangle;

  constructor(private readonly scene: Phaser.Scene) {
    this.back = scene.add
      .rectangle(0, 0, 180, 58, 0x07131b, 0.72)
      .setOrigin(1, 0)
      .setStrokeStyle(1, 0xd7e3ef, 0.32);
    this.scoreText = scene.add
      .text(-12, 9, "", {
        fontFamily: "Arial, 'Microsoft YaHei', sans-serif",
        fontSize: "15px",
        fontStyle: "700",
        color: "#f4f8ff",
        align: "right",
      })
      .setOrigin(1, 0);
    this.moneyText = scene.add
      .text(-12, 31, "", {
        fontFamily: "Arial, 'Microsoft YaHei', sans-serif",
        fontSize: "14px",
        fontStyle: "700",
        color: "#ffd45c",
        align: "right",
      })
      .setOrigin(1, 0);
    this.container = scene.add
      .container(0, 0, [this.back, this.scoreText, this.moneyText])
      .setDepth(Depth.CrosshairText)
      .setScrollFactor(0)
      .setVisible(false);
  }

  render(extra: CollaborateExtraState | undefined, localKey: FighterKey): void {
    if (!extra || (localKey !== "Player1" && localKey !== "Player2")) {
      this.container.setVisible(false);
      return;
    }
    const margin = 18;
    this.container.setPosition(this.scene.scale.width - margin, margin);
    this.scoreText.setText(
      t("battle.collaborate_score", {
        value: extra.scoreByPlayerId[localKey],
      }),
    );
    this.moneyText.setText(
      t("battle.collaborate_money", {
        value: extra.moneyByPlayerId[localKey],
      }),
    );
    this.container.setVisible(true);
  }
}
