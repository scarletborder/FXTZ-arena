import Phaser from "phaser";
import { getAvailableCollaborateMaps } from "@repo/content";
import { IS_DESKTOP_APP } from "@repo/constants";
import { t } from "@repo/i18n";
import type { MapId } from "@repo/types";

import {
  bodyStyle,
  createFightButton,
  drawAngledPanel,
} from "../ui";
import {
  setDebug,
  setLogPath,
  uiSettings,
} from "../../store/settings";
import type { SettingsScene } from "./index";
import { selectLogDirectory } from "../../platform/desktop-log-path";
import { createMapDropdown } from "../map-dialog";
import {
  getDebugCooperateEliteOptions,
  type DebugCooperateJumpConfig,
} from "../debug-cooperate";
import type { DebugCooperateJumpTarget, SelectionData } from "../shared";

export function renderDebugTab(scene: SettingsScene, layer: Phaser.GameObjects.Container): void {
  let debugCooperateDialog: Phaser.GameObjects.Container | null = null;

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

  layer.add(sectionTitle(scene, 36, 380, t("settings.debug.cooperate.title")));
  layer.add(createFightButton(scene, 161, 340, 250, 54, t("settings.debug.cooperate.button"), () => {
    debugCooperateDialog = showDebugCooperateDialog(scene, debugCooperateDialog);
  }, { accent: 0x34d399 }).container);


  // ── Debug bullet volume section ──
  const margin = 300;
  layer.add(sectionTitle(scene, margin + 31, 34, "调试弹幕体积"));

  layer.add(scene.add.text(
    margin + 36,
    72,
    "在新场景中查看全部 30 种弹幕类型及其判定体积。\nShift 切换暂停，ESC 返回。",
    bodyStyle("#9fd8ff", 16),
  ));

  layer.add(createFightButton(scene, margin + 161, 145, 230, 54, "弹幕体积测试", () => {
    scene.scene.start("debug-bullet-volume");
  }, { accent: 0x9b59b6 }).container);

  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
    debugCooperateDialog?.destroy();
    debugCooperateDialog = null;
  });
}

function sectionTitle(scene: Phaser.Scene, x: number, y: number, label: string): Phaser.GameObjects.Text {
  return scene.add.text(x, y, label, {
    ...bodyStyle("#ffcf6e", 20),
    fontStyle: "700",
  });
}

function showDebugCooperateDialog(
  scene: Phaser.Scene,
  currentContainer: Phaser.GameObjects.Container | null,
): Phaser.GameObjects.Container {
  currentContainer?.destroy();

  const maps = getAvailableCollaborateMaps();
  let selectedMapId: MapId = maps[0]?.id ?? "collaborate_test_arena";
  let selectedTarget: DebugCooperateJumpTarget = "start";
  let selectedEliteIndex = 0;

  const container = scene.add.container(0, 0).setDepth(20_000);
  container.add(scene.add.rectangle(640, 360, 1280, 720, 0x000000, 0.62).setInteractive());

  const panel = scene.add.graphics();
  drawAngledPanel(panel, 390, 164, 500, 392, 0x111821, 0x34d399, 0.98);
  container.add(panel);
  container.add(scene.add.text(640, 204, t("settings.debug.cooperate.dialog_title"), {
    fontFamily: "Arial, 'Microsoft YaHei', sans-serif",
    fontSize: "24px",
    fontStyle: "700",
    color: "#ffcf6e",
  }).setOrigin(0.5));

  container.add(scene.add.text(456, 252, t("settings.debug.cooperate.map"), bodyStyle("#f6f1e6", 16)));
  const mapDropdown = createMapDropdown(scene, 456, 280, 368, maps, selectedMapId, (mapId) => {
    selectedMapId = mapId;
    selectedEliteIndex = 0;
    renderEliteDropdown();
  });
  container.add(mapDropdown.container);

  container.add(scene.add.text(456, 338, t("settings.debug.cooperate.target"), bodyStyle("#f6f1e6", 16)));
  const targetOptions = [
    { id: "start", name: t("settings.debug.cooperate.target_start") },
    { id: "elite", name: t("settings.debug.cooperate.target_elite") },
    { id: "boss", name: t("settings.debug.cooperate.target_boss") },
  ] as const;
  const targetDropdown = createMapDropdown(scene, 456, 366, 368, targetOptions, selectedTarget, (target) => {
    selectedTarget = target;
    renderEliteDropdown();
  });
  container.add(targetDropdown.container);

  const eliteLayer = scene.add.container(0, 0);
  container.add(eliteLayer);

  const renderEliteDropdown = () => {
    eliteLayer.removeAll(true);
    if (selectedTarget !== "elite") return;

    const eliteOptions = getDebugCooperateEliteOptions(selectedMapId);
    selectedEliteIndex = Math.min(selectedEliteIndex, Math.max(0, eliteOptions.length - 1));
    eliteLayer.add(scene.add.text(456, 424, t("settings.debug.cooperate.elite_wave"), bodyStyle("#f6f1e6", 16)));
    eliteLayer.add(createMapDropdown(
      scene,
      456,
      452,
      368,
      eliteOptions.length > 0 ? eliteOptions : [{ id: "0", name: t("settings.debug.cooperate.no_elite") }],
      String(selectedEliteIndex),
      (id) => {
        selectedEliteIndex = Math.max(0, Number(id) || 0);
      },
    ).container);
  };
  renderEliteDropdown();

  container.add(createFightButton(scene, 560, 520, 140, 42, t("battle_start.cancel"), () => {
    container.destroy();
  }, { accent: 0x5c7185 }).container);
  container.add(createFightButton(scene, 720, 520, 140, 42, t("select.confirm_battle"), () => {
    const debugCooperate: DebugCooperateJumpConfig = selectedTarget === "elite"
      ? { target: selectedTarget, eliteWaveIndex: selectedEliteIndex }
      : { target: selectedTarget };
    container.destroy();
    scene.scene.start("select", {
      mode: "debug_cooperate",
      mapId: selectedMapId,
      battleMode: "collaborate",
      debugCooperate,
      returnScene: "settings",
    } satisfies SelectionData);
  }, { accent: 0x34d399 }).container);

  return container;
}
