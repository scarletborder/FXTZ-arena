import Phaser from "phaser";
import { t } from "@repo/i18n";

import {
  bodyStyle,
  createCheckbox,
  createFightButton,
} from "../ui";
import {
  setBattleHoverResources,
  setMusicVolume,
  setSoundVolume,
  settingsRepository
} from "../../store/settings";
import type { SettingsScene } from "./index";
import { showLanguageDialog } from "../ui/dialogs/language-dialog";

interface SliderControl {
  readonly container: Phaser.GameObjects.Container;
  setValue(value: number): void;
}

export function renderGeneralTab(scene: SettingsScene, layer: Phaser.GameObjects.Container): void {
  layer.add(sectionTitle(scene, 36, 34, t("settings.general")));
  layer.add(scene.add.text(36, 86, t("settings.general.music.title"), bodyStyle("#f6f1e6", 18)));
  layer.add(createVolumeSlider(scene, 36, 124, 360, settingsRepository.get().music, setMusicVolume).container);
  layer.add(scene.add.text(36, 178, t("settings.general.sound.title"), bodyStyle("#f6f1e6", 18)));
  layer.add(createVolumeSlider(scene, 36, 216, 360, settingsRepository.get().sound, setSoundVolume).container);

  layer.add(sectionTitle(scene, 616, 178, t("settings.general.display.title")));
  layer.add(scene.add.text(616, 220, t("settings.general.display.subtitle"), bodyStyle("#b7c7d8", 15)).setWordWrapWidth(370));
  layer.add(createCheckbox(scene, 616, 268, settingsRepository.get().battleHoverResources, {
    label: t("settings.general.display.battleHoverResources"),
    onChange: setBattleHoverResources,
  }).container);

  const languageLabel = scene.add.text(616, 34, t("settings.general.language.title"), bodyStyle("#f6f1e6", 18));
  const languageHint = scene.add.text(616, 72, t("settings.general.language.subtitle"), bodyStyle("#b7c7d8", 15));
  layer.add([languageLabel, languageHint, createFightButton(scene, 741, 130, 250, 54, t("settings.general.language.title"), () => {
    showLanguageDialog(scene);
  }, { accent: 0x34d399 }).container]);
}

function sectionTitle(scene: Phaser.Scene, x: number, y: number, label: string): Phaser.GameObjects.Text {
  return scene.add.text(x, y, label, {
    ...bodyStyle("#ffcf6e", 20),
    fontStyle: "700",
  });
}

function createVolumeSlider(
  scene: SettingsScene,
  x: number,
  y: number,
  width: number,
  value: number,
  onChange: (value: number) => void,
): SliderControl {
  const height = 28;
  const container = scene.add.container(x, y);
  const track = scene.add.graphics();
  const valueText = scene.add.text(width, -2, "0", bodyStyle("#9fd8ff", 17)).setOrigin(1, 0);
  const hitArea = scene.add.rectangle(0, 0, width, height, 0xffffff, 0.001)
    .setOrigin(0, 0)
    .setInteractive({ useHandCursor: true });
  let currentValue = clampVolume(value);
  let hovering = false;
  let dragging = false;

  const draw = () => {
    const ratio = currentValue / 100;
    const fillWidth = Math.max(0, Math.round(width * ratio));
    const handleX = Math.round(fillWidth);

    track.clear();
    track.lineStyle(2, dragging || hovering ? 0xffcf6e : 0x5c7185, 1);
    track.strokeRect(0, 12, width, 10);
    track.fillStyle(0x101820, 1);
    track.fillRect(1, 13, width - 2, 8);
    track.fillStyle(0x34d399, 0.9);
    track.fillRect(1, 13, Math.max(0, fillWidth - 2), 8);
    track.fillStyle(0xf6f1e6, dragging || hovering ? 1 : 0.88);
    track.fillCircle(handleX, 17, dragging || hovering ? 9 : 8);

    valueText.setText(String(currentValue));
    valueText.setColor(dragging || hovering ? "#ffcf6e" : "#9fd8ff");
  };

  const updateFromPointer = (pointer: Phaser.Input.Pointer) => {
    const matrix = container.getWorldTransformMatrix();
    const localPoint = matrix.applyInverse(pointer.x, pointer.y);
    const localX = Phaser.Math.Clamp(localPoint.x, 0, width);
    const nextValue = Math.round((localX / width) * 100);
    if (nextValue !== currentValue) {
      currentValue = nextValue;
      onChange(currentValue);
      draw();
    }
  };

  hitArea.on("pointerover", () => {
    hovering = true;
    draw();
  });
  hitArea.on("pointerout", () => {
    hovering = false;
    if (!dragging) {
      draw();
    }
  });
  hitArea.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
    dragging = true;
    updateFromPointer(pointer);
    draw();
  });

  const onPointerMove = (pointer: Phaser.Input.Pointer) => {
    if (dragging && pointer.isDown) {
      updateFromPointer(pointer);
    }
  };
  const onPointerUp = () => {
    if (!dragging) {
      return;
    }
    dragging = false;
    draw();
  };

  scene.input.on("pointermove", onPointerMove);
  scene.input.on("pointerup", onPointerUp);
  scene.addCleanup(() => {
    scene.input.off("pointermove", onPointerMove);
    scene.input.off("pointerup", onPointerUp);
  });

  container.add([track, valueText, hitArea]);
  draw();
  onChange(currentValue);

  return {
    container,
    setValue(nextValue: number): void {
      currentValue = clampVolume(nextValue);
      onChange(currentValue);
      draw();
    },
  };
}

function clampVolume(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}
