import Phaser from "phaser";
import { t } from "@repo/i18n";

import {
  bodyStyle,
  createFightButton,
} from "../ui";
import type { SettingsScene } from "./index";

export function renderVirtualJoyTab(scene: SettingsScene, layer: Phaser.GameObjects.Container): void {
  layer.add(sectionTitle(scene, 36, 34, t("settings.virtualJoy.title")));
  layer.add(scene.add.text(
    36,
    86,
    t("settings.virtualJoy.description"),
    bodyStyle("#b7c7d8", 18),
  ).setWordWrapWidth(680));

  const configureButton = createFightButton(
    scene,
    176,
    178,
    240,
    48,
    t("settings.virtualJoy.configure"),
    () => scene.scene.start("configure-virtual-joy"),
    { accent: 0x8af7ff },
  );
  layer.add(configureButton.container);
}

function sectionTitle(scene: Phaser.Scene, x: number, y: number, label: string): Phaser.GameObjects.Text {
  return scene.add.text(x, y, label, {
    ...bodyStyle("#ffcf6e", 18),
    fontStyle: "700",
  });
}
