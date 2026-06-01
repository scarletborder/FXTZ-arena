import Phaser from "phaser";

import { languageDisplayNames, supportedLanguages, type SupportedLanguage, getLanguage, setLanguage, t } from "@repo/i18n";

import { bodyStyle, drawAngledPanel } from "./ui";

const GAME_WIDTH = 1280;
const GAME_HEIGHT = 720;

interface OpenLanguageDialogOptions {
  readonly onClose?: () => void;
}

export function showLanguageDialog(scene: Phaser.Scene, options: OpenLanguageDialogOptions = {}): Phaser.GameObjects.Container {
  const rowHeight = 58;
  const dialogWidth = 520;
  const dialogHeight = 120 + supportedLanguages.length * rowHeight;
  const x = Math.round((GAME_WIDTH - dialogWidth) / 2);
  const y = Math.max(88, Math.round((GAME_HEIGHT - dialogHeight) / 2));
  const viewportHeight = 280;
  const layer = scene.add.container(0, 0).setDepth(1000);
  const shade = scene.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x05070a, 0.66).setOrigin(0, 0).setInteractive();
  const panel = scene.add.graphics();
  drawAngledPanel(panel, x, y, dialogWidth, dialogHeight, 0x101820, 0xffcf6e, 0.98);
  const title = scene.add.text(x + 28, y + 22, t("settings.general.language.dialog_title"), bodyStyle("#ffcf6e", 22));
  const closeBtn = createCloseButton(scene, x + dialogWidth - 62, y + 18, () => layer.destroy());
  const hint = scene.add.text(x + 28, y + 56, t("settings.general.language.subtitle"), bodyStyle("#d7e3ef", 15));
  const viewport = scene.add.container(x + 24, y + 92);
  const content = scene.add.container(0, 0);
  const maskShape = scene.add.graphics();
  maskShape.setVisible(false);
  maskShape.fillStyle(0xffffff, 1);
  maskShape.fillRect(x + 24, y + 92, dialogWidth - 48, viewportHeight);
  const mask = maskShape.createGeometryMask();
  content.setMask(mask);

  const current = getLanguage();
  supportedLanguages.forEach((lang: SupportedLanguage, index: number) => {
    content.add(createLanguageRow(scene, 0, index * rowHeight, dialogWidth - 48, rowHeight - 10, lang, current, () => {
      setLanguage(lang);
      options.onClose?.();
      layer.destroy();
    }));
  });
  viewport.add(content);

  const wheelHandler = (_pointer: Phaser.Input.Pointer, _currentlyOver: unknown, _dx: number, _dy: number, _dz: number, event: WheelEvent) => {
    event.preventDefault();
    const maxScroll = Math.max(0, supportedLanguages.length * rowHeight - viewportHeight);
    const nextY = Phaser.Math.Clamp(content.y - event.deltaY * 0.6, -maxScroll, 0);
    content.y = nextY;
  };
  scene.input.on("wheel", wheelHandler);
  layer.once("destroy", () => {
    scene.input.off("wheel", wheelHandler);
    options.onClose?.();
  });
  layer.add([shade, panel, title, hint, closeBtn, viewport]);
  shade.on("pointerup", () => layer.destroy());
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => layer.destroy());
  return layer;
}

function createLanguageRow(
  scene: Phaser.Scene,
  x: number,
  y: number,
  width: number,
  height: number,
  lang: SupportedLanguage,
  current: SupportedLanguage,
  onClick: () => void,
): Phaser.GameObjects.Container {
  let hovering = false;
  const selected = current === lang;
  const container = scene.add.container(x, y);
  const background = scene.add.graphics();
  const label = scene.add.text(18, 9, languageDisplayNames[lang], bodyStyle(selected ? "#ffcf6e" : "#f6f1e6", 18));
  const marker = scene.add.text(width - 26, 10, selected ? "●" : "", bodyStyle("#34d399", 18)).setOrigin(1, 0);
  const hitArea = scene.add.rectangle(0, 0, width, height, 0xffffff, 0.001).setOrigin(0, 0).setInteractive({ useHandCursor: true });

  const draw = () => {
    background.clear();
    const fill = selected ? 0x263244 : hovering ? 0x18212d : 0x0f141d;
    const stroke = selected ? 0xffcf6e : hovering ? 0x9fd8ff : 0x34475c;
    drawAngledPanel(background, 0, 0, width, height, fill, stroke, 1);
    label.setColor(selected || hovering ? "#ffcf6e" : "#f6f1e6");
    marker.setText(selected ? "●" : "");
  };

  hitArea.on("pointerover", () => { hovering = true; draw(); });
  hitArea.on("pointerout", () => { hovering = false; draw(); });
  hitArea.on("pointerup", onClick);
  container.add([background, label, marker, hitArea]);
  draw();
  return container;
}

function createCloseButton(scene: Phaser.Scene, x: number, y: number, onClick: () => void): Phaser.GameObjects.Container {
  let hovering = false;
  const width = 34;
  const height = 30;
  const container = scene.add.container(x, y);
  const background = scene.add.graphics();
  const label = scene.add.text(width / 2, height / 2 - 1, "×", bodyStyle("#f6f1e6", 23)).setOrigin(0.5);
  const hitArea = scene.add.rectangle(0, 0, width, height, 0xffffff, 0.001).setOrigin(0, 0).setInteractive({ useHandCursor: true });
  const draw = () => {
    background.clear();
    drawAngledPanel(background, 0, 0, width, height, hovering ? 0x342335 : 0x151b26, hovering ? 0xff5c66 : 0x5c7185, 1);
  };
  hitArea.on("pointerover", () => { hovering = true; draw(); });
  hitArea.on("pointerout", () => { hovering = false; draw(); });
  hitArea.on("pointerup", (_pointer: Phaser.Input.Pointer, _localX: number, _localY: number, event: Phaser.Types.Input.EventData) => {
    event.stopPropagation();
    onClick();
  });
  container.add([background, label, hitArea]);
  draw();
  return container;
}
