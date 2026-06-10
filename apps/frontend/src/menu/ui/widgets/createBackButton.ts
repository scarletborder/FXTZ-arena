import Phaser from "phaser";
import { t } from "@repo/i18n";

import { createFightButton } from "./createFightButton";

export function createBackButton(
  scene: Phaser.Scene,
  target: string = "home",
  x = 1138,
  y = 62,
): void {
  createFightButton(scene, x, y, 160, 44, t("menu.back"), () => scene.scene.start(target), { accent: 0x5c7185 });
}
