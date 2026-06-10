import Phaser from "phaser";

import { FONT } from "./constants";

export interface CheckboxControl {
  readonly container: Phaser.GameObjects.Container;
  setChecked(checked: boolean): void;
  setEnabled(enabled: boolean): void;
}

interface CheckboxOptions {
  readonly label?: string;
  readonly enabled?: boolean;
  readonly onChange?: (checked: boolean) => void;
}

export function createCheckbox(
  scene: Phaser.Scene,
  x: number,
  y: number,
  checked: boolean,
  options: CheckboxOptions = {},
): CheckboxControl {
  let currentChecked = checked;
  let enabled = options.enabled ?? true;
  let hovered = false;

  const boxSize = 26;
  const container = scene.add.container(x, y - boxSize / 2);
  const background = scene.add.graphics();
  const checkMark = scene.add.graphics();
  const label = options.label
    ? scene.add.text(boxSize + 14, boxSize / 2 + 1, options.label, {
      fontFamily: FONT,
      fontSize: "18px",
      color: enabled ? "#f6f1e6" : "#7f8994",
    }).setOrigin(0, 0.5)
    : undefined;
  const width = boxSize + (label ? label.width + 14 : 0);
  const hitArea = scene.add.rectangle(0, 0, Math.max(width, boxSize), boxSize, 0xffffff, 0.001)
    .setOrigin(0, 0)
    .setInteractive({ useHandCursor: enabled });

  const redraw = () => {
    background.clear();
    checkMark.clear();

    const fill = enabled ? (hovered ? 0x252e3d : 0x151b26) : 0x2b2f36;
    const stroke = enabled ? (currentChecked ? 0x34d399 : hovered ? 0xffcf6e : 0x5c7185) : 0x656a72;
    background.fillStyle(fill, enabled ? 0.98 : 0.72);
    background.fillRoundedRect(0, 0, boxSize, boxSize, 6);
    background.lineStyle(2, stroke, enabled ? 1 : 0.45);
    background.strokeRoundedRect(0, 0, boxSize, boxSize, 6);

    if (currentChecked) {
      checkMark.lineStyle(3, enabled ? 0x34d399 : 0x87909a, 1);
      checkMark.beginPath();
      checkMark.moveTo(6, 14);
      checkMark.lineTo(11, 19);
      checkMark.lineTo(20, 7);
      checkMark.strokePath();
    }

    label?.setColor(enabled ? (hovered ? "#ffcf6e" : "#f6f1e6") : "#7f8994");
  };

  const toggle = () => {
    if (!enabled) {
      return;
    }
    currentChecked = !currentChecked;
    options.onChange?.(currentChecked);
    redraw();
  };

  hitArea.on("pointerover", () => {
    hovered = true;
    redraw();
  });
  hitArea.on("pointerout", () => {
    hovered = false;
    redraw();
  });
  hitArea.on("pointerup", () => {
    toggle();
  });

  container.add([background, checkMark, hitArea]);
  if (label) {
    container.add(label);
  }
  redraw();

  return {
    container,
    setChecked(nextChecked: boolean): void {
      currentChecked = nextChecked;
      redraw();
    },
    setEnabled(nextEnabled: boolean): void {
      enabled = nextEnabled;
      hitArea.disableInteractive();
      hitArea.setInteractive({ useHandCursor: enabled });
      redraw();
    },
  };
}