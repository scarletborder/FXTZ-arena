import Phaser from "phaser";

import { bodyStyle } from "./styles";

interface EntryTileOptions {
  readonly width: number;
  readonly height: number;
  readonly title: string;
  readonly subtitle: string;
  readonly badge: string;
  readonly selected: boolean;
  readonly accent?: number;
  readonly onClick: () => void;
  readonly drawIcon: (target: Phaser.GameObjects.Container) => void;
}

interface EntryTileControl {
  readonly container: Phaser.GameObjects.Container;
  readonly hitArea: Phaser.GameObjects.Rectangle;
  readonly width: number;
  readonly height: number;
  setSelected(selected: boolean): void;
  setHovered(hovered: boolean): void;
}
export function createEntryTile(
  scene: Phaser.Scene,
  x: number,
  y: number,
  options: EntryTileOptions,
): EntryTileControl {
  let selected = options.selected;
  let hovered = false;

  // 1. 将 Container 坐标强制进行四舍五入，避免小数坐标引发次像素渲染和抗锯齿导致的视觉倾斜
  const posX = Math.round(x - options.width / 2);
  const posY = Math.round(y - options.height / 2);
  const container = scene.add.container(posX, posY);

  const background = scene.add.graphics();
  const hitArea = scene.add.rectangle(0, 0, options.width, options.height, 0xffffff, 0.001)
    .setOrigin(0, 0)
    .setInteractive({ useHandCursor: true });

  const titleText = scene.add.text(options.width / 2, options.height - 40, options.title, bodyStyle("#f6f1e6", options.width === 164 ? 15 : 14)).setOrigin(0.5);
  const subtitleText = scene.add.text(options.width / 2, options.height - 20, options.subtitle, bodyStyle("#ffcf6e", options.width === 164 ? 13 : 12)).setOrigin(0.5);

  const draw = () => {
    background.clear();
    const fill = selected ? 0x263244 : hovered ? 0x18212d : 0x151b26;
    const stroke = selected ? 0xffcf6e : hovered ? (options.accent ?? 0x5c7185) : 0x34475c;

    // 2. 像素级对齐描边
    const lineWidth = 2;
    background
      .fillStyle(fill, 1)
      .fillRect(0, 0, options.width, options.height)
      .lineStyle(lineWidth, stroke, 1)
      // 将描边区域向内缩进 lineWidth / 2 像素，使其完全落在 [0, width] 像素边界内，保证边缘平整锐利
      .strokeRect(
        lineWidth / 2,
        lineWidth / 2,
        options.width - lineWidth,
        options.height - lineWidth
      );

    titleText.setColor(selected ? "#ffffff" : "#f6f1e6");
    subtitleText.setColor(selected ? "#ffcf6e" : hovered ? "#d7e3ef" : "#ffcf6e");
  };

  const iconLayer = scene.add.container(0, 0);
  options.drawIcon(iconLayer);
  container.add([background, iconLayer, titleText, subtitleText, hitArea]);

  hitArea.on("pointerover", () => {
    hovered = true;
    draw();
  });
  hitArea.on("pointerout", () => {
    hovered = false;
    draw();
  });
  hitArea.on("pointerdown", () => {
    draw();
  });
  hitArea.on("pointerup", (pointer: Phaser.Input.Pointer) => {
    if (pointer.getDistance() <= 10) {
      options.onClick();
    }
  });

  draw();

  return {
    container,
    hitArea,
    width: options.width,
    height: options.height,
    setSelected(nextSelected: boolean): void {
      selected = nextSelected;
      draw();
    },
    setHovered(nextHovered: boolean): void {
      hovered = nextHovered;
      draw();
    },
  };
}