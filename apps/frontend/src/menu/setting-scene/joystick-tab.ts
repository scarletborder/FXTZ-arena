import Phaser from "phaser";
import { t } from "@repo/i18n";

import {
  bodyStyle,
  createFightButton,
  drawAngledPanel,
} from "../ui";
import { createMapDropdown } from "../map-dialog";
import { DEFAULT_JOYSTICK_SETTINGS, JoystickAxisSource, JoystickButtonInput, JoystickSettings } from "../../battle/input-controller";
import { setJoystickSettings, uiSettings } from "../../store/settings";
import type { SettingsScene } from "./index";

interface AxisRowConfig {
  readonly action: keyof Pick<JoystickSettings, "move" | "aim">;
  readonly labelKey: string;
  readonly options: readonly JoystickAxisSource[];
}

interface ButtonRowConfig {
  readonly action: keyof Omit<JoystickSettings, "move" | "aim">;
  readonly labelKey: string;
}

const AXIS_ROWS: readonly AxisRowConfig[] = [
  { action: "move", labelKey: "settings.joystick.move", options: ["dpad", "leftStick", "rightStick"] },
  { action: "aim", labelKey: "settings.joystick.aim", options: ["rightStick", "leftStick", "dpad"] },
];

const LEFT_BUTTON_ROWS: readonly ButtonRowConfig[] = [
  { action: "shoot", labelKey: "settings.joystick.shoot" },
  { action: "bomb", labelKey: "settings.joystick.bomb" },
  { action: "alternate", labelKey: "settings.joystick.alt" },
  { action: "reload", labelKey: "settings.joystick.reload" },
];

const RIGHT_BUTTON_ROWS: readonly ButtonRowConfig[] = [
  { action: "activeCard", labelKey: "settings.joystick.active" },
  { action: "info", labelKey: "settings.joystick.info" },
  { action: "enter", labelKey: "settings.joystick.enter" },
];

const BUTTON_OPTIONS: readonly JoystickButtonInput[] = ["A", "B", "X", "Y", "LB", "RB", "LT", "RT"];

export function renderJoystickTab(scene: SettingsScene, layer: Phaser.GameObjects.Container): void {
  let tempSettings: JoystickSettings = { ...uiSettings.joystick };
  const tabContent = scene.add.container(0, 0);
  const statusText = scene.add.text(36, 396, "", bodyStyle("#ffcf6e", 16));

  layer.add(tabContent);
  layer.add(statusText);

  const drawTabContent = () => {
    tabContent.removeAll(true);
    tabContent.add(sectionTitle(scene, 36, 28, t("settings.joystick.sectionAxes")));
    tabContent.add(sectionTitle(scene, 36, 156, t("settings.joystick.sectionButtons")));

    const duplicateAxes = findDuplicateAxes(tempSettings);
    const duplicateButtons = findDuplicateButtons(tempSettings);

    AXIS_ROWS.forEach((row, index) => {
      tabContent.add(createJoystickDropdownRow(
        scene,
        36,
        72 + index * 54,
        510,
        46,
        t(row.labelKey),
        row.options.map((id) => ({ id, name: t(`settings.joystick.axis.${id}`) })),
        tempSettings[row.action],
        (value) => {
          tempSettings = { ...tempSettings, [row.action]: value };
          statusText.setText("");
          drawTabContent();
        },
        duplicateAxes.has(row.action),
      ));
    });

    LEFT_BUTTON_ROWS.forEach((row, index) => {
      tabContent.add(createJoystickDropdownRow(
        scene,
        36,
        198 + index * 50,
        510,
        42,
        t(row.labelKey),
        buttonOptions(),
        tempSettings[row.action],
        (value) => {
          tempSettings = { ...tempSettings, [row.action]: value };
          statusText.setText("");
          drawTabContent();
        },
        duplicateButtons.has(row.action),
      ));
    });

    RIGHT_BUTTON_ROWS.forEach((row, index) => {
      tabContent.add(createJoystickDropdownRow(
        scene,
        580,
        198 + index * 50,
        510,
        42,
        t(row.labelKey),
        buttonOptions(),
        tempSettings[row.action],
        (value) => {
          tempSettings = { ...tempSettings, [row.action]: value };
          statusText.setText("");
          drawTabContent();
        },
        duplicateButtons.has(row.action),
      ));
    });

    const confirmButton = createFightButton(
      scene,
      750,
      366,
      160,
      42,
      t("settings.joystick.confirm"),
      () => {
        const hasConflicts = duplicateAxes.size > 0 || duplicateButtons.size > 0;
        if (hasConflicts) {
          statusText.setText(t("settings.joystick.conflictError")).setColor("#ff5c66");
          drawTabContent();
          return;
        }
        setJoystickSettings(tempSettings);
        statusText.setText(t("settings.joystick.saveSuccess")).setColor("#34d399");
        drawTabContent();
      },
      { accent: 0x34d399 },
    );
    tabContent.add(confirmButton.container);

    const resetButton = createFightButton(
      scene,
      930,
      366,
      160,
      42,
      t("settings.joystick.reset"),
      () => {
        tempSettings = { ...DEFAULT_JOYSTICK_SETTINGS };
        statusText.setText(t("settings.joystick.resetSuccess")).setColor("#ffcf6e");
        drawTabContent();
      },
      { accent: 0x5c7185 },
    );
    tabContent.add(resetButton.container);
  };

  drawTabContent();
}

function createJoystickDropdownRow<TId extends string>(
  scene: Phaser.Scene,
  x: number,
  y: number,
  width: number,
  height: number,
  label: string,
  options: readonly { readonly id: TId; readonly name: string }[],
  selected: TId,
  onChange: (value: TId) => void,
  isDuplicated: boolean,
): Phaser.GameObjects.Container {
  const container = scene.add.container(x, y);
  const background = scene.add.graphics();
  const stroke = isDuplicated ? 0xff5c66 : 0x34475c;
  drawAngledPanel(background, 0, 0, width, height, 0x151b26, stroke, 1);
  container.add(background);
  container.add(scene.add.text(18, Math.round(height / 2 - 10), label, bodyStyle(isDuplicated ? "#ff8890" : "#f6f1e6", 16)));
  container.add(createMapDropdown(scene, width - 210, 4, 192, options, selected, onChange).container);
  return container;
}

function buttonOptions(): readonly { readonly id: JoystickButtonInput; readonly name: string }[] {
  return BUTTON_OPTIONS.map((id) => ({ id, name: t(`settings.joystick.button.${id}`) }));
}

function findDuplicateAxes(settings: JoystickSettings): Set<"move" | "aim"> {
  return settings.move === settings.aim ? new Set(["move", "aim"]) : new Set();
}

function findDuplicateButtons(settings: JoystickSettings): Set<keyof Omit<JoystickSettings, "move" | "aim">> {
  const actions = ["shoot", "bomb", "alternate", "reload", "activeCard", "info", "enter"] as const;
  const seen = new Map<JoystickButtonInput, Array<(typeof actions)[number]>>();
  actions.forEach((action) => {
    const input = settings[action];
    seen.set(input, [...(seen.get(input) ?? []), action]);
  });
  const duplicates = new Set<(typeof actions)[number]>();
  seen.forEach((duplicatedActions) => {
    if (duplicatedActions.length > 1) {
      duplicatedActions.forEach((action) => duplicates.add(action));
    }
  });
  return duplicates;
}

function sectionTitle(scene: Phaser.Scene, x: number, y: number, label: string): Phaser.GameObjects.Text {
  return scene.add.text(x, y, label, {
    ...bodyStyle("#ffcf6e", 18),
    fontStyle: "700",
  });
}
