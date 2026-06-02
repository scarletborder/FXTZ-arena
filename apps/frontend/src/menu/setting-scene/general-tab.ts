import Phaser from "phaser";
import { t } from "@repo/i18n";

import {
  bodyStyle,
  createFightButton,
  createTextField,
} from "../ui";
import {
  setMusicVolume,
  setSoundVolume,
  setUsername,
  uiSettings,
} from "../../store/settings";
import type { TextFieldControl } from "../shared";
import type { SettingsScene } from "./index";
import { showLanguageDialog } from "../language-dialog";

interface SliderControl {
  readonly container: Phaser.GameObjects.Container;
  setValue(value: number): void;
}

export function renderGeneralTab(scene: SettingsScene, layer: Phaser.GameObjects.Container): void {
  let activeField: TextFieldControl | undefined;
  const usernameField = createTextField(scene, 36, 124, 360, {
    value: uiSettings.username,
    maxLength: MAX_PLAYER_NAME_LENGTH,
    onFocus: (field) => {
      if (activeField === field) {
        return;
      }
      activeField?.setActive(false);
      activeField = field;
    },
    onChange: setUsername,
  });
  usernameField.hitArea.on("pointerdown", () => {
    activeField?.setActive(false);
    activeField = usernameField;
    usernameField.setActive(true);
  });

  const onKeyDown = (event: KeyboardEvent) => activeField?.handleKey(event);
  const onPaste = (event: ClipboardEvent) => {
    const text = event.clipboardData?.getData("text") ?? "";
    if (activeField && text) {
      activeField.handlePaste(text);
      event.preventDefault();
    }
  };

  layer.add(sectionTitle(scene, 36, 34, t("settings.general")));
  layer.add(scene.add.text(36, 86, t("settings.general.username.title"), bodyStyle("#f6f1e6", 18)));
  layer.add(usernameField.container);

  layer.add(sectionTitle(scene, 36, 190, t("settings.general")));
  layer.add(scene.add.text(36, 242, t("settings.general.music.title"), bodyStyle("#f6f1e6", 18)));
  layer.add(createVolumeSlider(scene, 36, 280, 360, uiSettings.music, setMusicVolume).container);
  layer.add(scene.add.text(36, 334, t("settings.general.sound.title"), bodyStyle("#f6f1e6", 18)));
  layer.add(createVolumeSlider(scene, 36, 372, 360, uiSettings.sound, setSoundVolume).container);

  const languageLabel = scene.add.text(616, 34, t("settings.general.language.title"), bodyStyle("#f6f1e6", 18));
  const languageHint = scene.add.text(616, 72, t("settings.general.language.subtitle"), bodyStyle("#b7c7d8", 15));
  layer.add([languageLabel, languageHint, createFightButton(scene, 741, 130, 250, 54, t("settings.general.language.title"), () => {
    showLanguageDialog(scene);
  }, { accent: 0x34d399 }).container]);

  scene.input.keyboard?.on("keydown", onKeyDown);
  window.addEventListener("paste", onPaste);
  scene.addCleanup(() => {
    scene.input.keyboard?.off("keydown", onKeyDown);
    window.removeEventListener("paste", onPaste);
    activeField = undefined;
  });
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
const MAX_PLAYER_NAME_LENGTH = 32;
