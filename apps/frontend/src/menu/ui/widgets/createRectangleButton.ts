import Phaser from "phaser";
import { FightButton } from "../../shared";
import { FONT } from "../constants";
import { nonEmptyText } from "../helpers";
import { bodyStyle } from "../styles";


interface FightButtonOptions {
  readonly enabled?: boolean;
  readonly subLabel?: string;
  readonly accent?: number;
}

export function createRectangleButton(
  scene: Phaser.Scene,
  x: number,
  y: number,
  width: number,
  height: number,
  label: string,
  onClick?: () => void,
  options: FightButtonOptions = {},
): FightButton {
  let enabled = options.enabled ?? true;
  let hovered = false;
  const accent = options.accent ?? 0xe33d44;
  const container = scene.add.container(x - width / 2, y - height / 2);
  const background = scene.add.graphics();
  const labelText = scene.add.text(width / 2, options.subLabel ? height / 2 - 9 : height / 2, nonEmptyText(label), {
    fontFamily: FONT,
    fontSize: "22px",
    fontStyle: "700",
    color: enabled ? "#f6f1e6" : "#7f8994",
  }).setOrigin(0.5);
  const subText = options.subLabel
    ? scene.add.text(width / 2, height / 2 + 18, options.subLabel, bodyStyle(enabled ? "#b7c7d8" : "#68717b", 13)).setOrigin(0.5)
    : undefined;
  const hitArea = scene.add.rectangle(0, 0, width, height, 0xffffff, 0.001)
    .setOrigin(0, 0)
    .setInteractive({ useHandCursor: enabled });

  const redraw = () => {
    background.clear();
    const fill = enabled ? (hovered ? 0x252e3d : 0x151b26) : (hovered ? 0x373d46 : 0x2b2f36);
    const stroke = enabled ? (hovered ? 0xffcf6e : accent) : (hovered ? 0x8a919b : 0x656a72);
    background.fillStyle(fill, enabled ? 0.98 : 0.72);
    background.fillRect(0, 0, width, height);
    background.lineStyle(2, stroke, enabled ? 1 : 0.45);
    background.strokeRect(0, 0, width, height);
    labelText.setColor(enabled ? (hovered ? "#ffffff" : "#f6f1e6") : (hovered ? "#a7afb8" : "#7f8994"));
    subText?.setColor(enabled ? "#b7c7d8" : (hovered ? "#87909a" : "#68717b"));
  };

  hitArea.on("pointerover", () => {
    hovered = true;
    redraw();
  });
  hitArea.on("pointerout", () => {
    hovered = false;
    redraw();
  });
  hitArea.on("pointerdown", () => {
    if (enabled) {
      redraw();
    }
  });
  hitArea.on("pointerup", () => {
    if (enabled) {
      onClick?.();
    }
  });

  container.add([background, labelText, hitArea]);
  if (subText) {
    container.add(subText);
  }
  redraw();

  return {
    container,
    setEnabled(nextEnabled: boolean): void {
      enabled = nextEnabled;
      hitArea.disableInteractive();
      hitArea.setInteractive({ useHandCursor: enabled });
      redraw();
    },
    setLabel(nextLabel: string): void {
      if (!labelText.active || !labelText.scene) {
        return;
      }
      labelText.setText(nonEmptyText(nextLabel));
    },
  };
}