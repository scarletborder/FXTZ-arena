import Phaser from "phaser";
import { t } from "@repo/i18n";

import {
  bodyStyle,
  drawBuildLabel,
} from "../ui";
import type { SettingsScene } from "./index";

export function renderAboutTab(scene: SettingsScene, layer: Phaser.GameObjects.Container): void {
  layer.add(sectionTitle(scene, 36, 34, t("settings.about.staff")));
  layer.add(scene.add.text(
    36,
    86,
    t("settings.about.credits"),
    bodyStyle("#d7e3ef", 18),
  ).setLineSpacing(12));

  layer.add(sectionTitle(scene, 36, 214, t("settings.about.project_url")));
  layer.add(scene.add.text(36, 266, "github.com/scarletborder/FXTZ-arena", bodyStyle("#9fd8ff", 18)));

  layer.add(sectionTitle(scene, 36, 334, t("settings.about.version")));
  layer.add(drawBuildLabel(scene, 324, 384));
}

function sectionTitle(scene: Phaser.Scene, x: number, y: number, label: string): Phaser.GameObjects.Text {
  return scene.add.text(x, y, label, {
    ...bodyStyle("#ffcf6e", 20),
    fontStyle: "700",
  });
}
