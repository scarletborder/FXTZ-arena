import Phaser from "phaser";
import { IS_DESKTOP_APP } from "@repo/constants";
import { t } from "@repo/i18n";

import {
  bodyStyle,
  createFightButton,
} from "../ui";
import {
  setDebug,
  setLogPath,
  uiSettings,
} from "../../store/settings";
import type { SettingsScene } from "./index";
import { selectLogDirectory } from "../../platform/desktop-log-path";

export function renderDebugTab(scene: SettingsScene, layer: Phaser.GameObjects.Container): void {
  // ── Debug toggle section ──
  layer.add(sectionTitle(scene, 36, 34, t("settings.debug.toggle.title")));

  const debugText = scene.add.text(36, 86, " ", bodyStyle("#d7e3ef", 18));
  const updateDebugLabel = () => {
    debugText.setText(uiSettings.debug ? t("settings.debug.toggle.on") : t("settings.debug.toggle.off"));
  };
  updateDebugLabel();
  layer.add(debugText);

  layer.add(createFightButton(scene, 161, 150, 250, 54, t("settings.debug.toggle.button"), () => {
    setDebug(!uiSettings.debug);
    updateDebugLabel();
  }, { accent: 0xf7b733 }).container);

  // ── Log storage path section ──
  layer.add(sectionTitle(scene, 36, 210, t("settings.debug.log_path.title")));

  if (IS_DESKTOP_APP) {
    const pathText = scene.add.text(
      36,
      262,
      t("settings.debug.log_path.desktop_path", { path: uiSettings.logPath || "D:/" }),
      bodyStyle("#9fd8ff", 18),
    ).setWordWrapWidth(500);

    layer.add(pathText);
    layer.add(createFightButton(scene, 161, 330, 250, 54, t("settings.debug.log_path.select"), async () => {
      const path = await selectLogDirectory();
      if (path) {
        setLogPath(path);
        pathText.setText(t("settings.debug.log_path.desktop_path", { path }));
      }
    }, { accent: 0x34d399 }).container);
  } else {
    layer.add(scene.add.text(36, 262, t("settings.debug.log_path.browser_hint"), bodyStyle("#b7c7d8", 18)));
  }
}

function sectionTitle(scene: Phaser.Scene, x: number, y: number, label: string): Phaser.GameObjects.Text {
  return scene.add.text(x, y, label, {
    ...bodyStyle("#ffcf6e", 20),
    fontStyle: "700",
  });
}
