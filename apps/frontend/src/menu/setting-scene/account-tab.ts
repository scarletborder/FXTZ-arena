import Phaser from "phaser";
import { t } from "@repo/i18n";

import { bodyStyle, createRectangleButton } from "../ui";
import { createMapDropdown } from "../map-dialog";
import { setAccountSettings, settingsRepository } from "../../store/settings";
import { listProfiles, shortProfileHash } from "../../store/profile-repository";
import type { InputProfileId } from "../../battle/input-controller";
import type { SettingsScene } from "./index";

type BattleProfile = "Player1" | "Player2";

export function renderAccountTab(scene: SettingsScene, layer: Phaser.GameObjects.Container): void {
  let tempSettings = { ...settingsRepository.get().account };
  const rowsLayer = scene.add.container(0, 0);
  const statusText = scene.add.text(36, 392, "", bodyStyle("#34d399", 16));

  const refreshSettings = () => {
    setAccountSettings(tempSettings);
    statusText.setText(t("settings.account.saveSuccess"));
  };

  const renderPlayerRows = () => {
    rowsLayer.removeAll(true);

    const p1TitleY = 120;
    const p2TitleY = p1TitleY + 222 - 96;

    rowsLayer.add(createPlayerRows(
      scene,
      36,
      p1TitleY,
      t("settings.account.player1"),
      tempSettings.p1ProfileId,
      tempSettings.p1Input,
      (profileId) => {
        tempSettings = { ...tempSettings, p1ProfileId: profileId };
        refreshSettings();
      },
      (input) => {
        tempSettings = { ...tempSettings, p1Input: input };
        refreshSettings();
      },
    ));
    rowsLayer.add(createPlayerRows(
      scene,
      36,
      p2TitleY,
      t("settings.account.player2"),
      tempSettings.p2ProfileId,
      tempSettings.p2Input,
      (profileId) => {
        tempSettings = { ...tempSettings, p2ProfileId: profileId };
        refreshSettings();
      },
      (input) => {
        tempSettings = { ...tempSettings, p2Input: input };
        refreshSettings();
      },
    ));
  };

  layer.add(sectionTitle(scene, 36, 34, t("settings.account.localProfiles")));
  layer.add(rowsLayer);
  layer.add(createRectangleButton(
    scene,
    116,
    84,
    146,
    38,
    t("settings.account.refreshDevices"),
    () => {
      refreshGamepadList(scene);
      renderPlayerRows();
      refreshSettings();
    },
    { accent: 0x5c7185 },
  ).container);
  layer.add(createRectangleButton(
    scene,
    296,
    84,
    176,
    38,
    t("settings.account.manageProfiles"),
    () => scene.scene.start("profiles-manage"),
    { accent: 0x8af7ff },
  ).container);

  layer.add(sectionTitle(scene, 616, 34, t("settings.account.sectionBattle")));
  layer.add(createBattleProfileRow(
    scene,
    616,
    92,
    t("settings.account.battleProfile"),
    tempSettings.battleProfile,
    (profile) => {
      tempSettings = { ...tempSettings, battleProfile: profile };
      refreshSettings();
    },
  ));
  layer.add(scene.add.text(616, 154, t("settings.account.battleProfileHint"), bodyStyle("#b7c7d8", 15)).setWordWrapWidth(420));
  layer.add(statusText);
  renderPlayerRows();
}

function createPlayerRows(
  scene: Phaser.Scene,
  x: number,
  y: number,
  playerLabel: string,
  selectedProfileId: string,
  selectedInput: InputProfileId,
  onProfileChange: (profileId: string) => void,
  onInputChange: (input: InputProfileId) => void,
): Phaser.GameObjects.Container {
  const container = scene.add.container(x, y);
  container.add(scene.add.text(0, 0, playerLabel, bodyStyle("#ffcf6e", 18)));
  container.add(createProfileRow(
    scene,
    0,
    32,
    t("settings.account.profile"),
    selectedProfileId,
    onProfileChange,
  ));
  container.add(createInputRow(
    scene,
    0,
    80,
    t("settings.account.inputDevice"),
    selectedInput,
    onInputChange,
  ));
  return container;
}

function createProfileRow(
  scene: Phaser.Scene,
  x: number,
  y: number,
  label: string,
  selected: string,
  onChange: (profileId: string) => void,
): Phaser.GameObjects.Container {
  const container = scene.add.container(x, y);
  const options = listProfiles().map((profile) => ({
    id: profile.id,
    name: `${profile.username}  #${shortProfileHash(profile)}`,
  }));
  container.add(scene.add.text(0, 8, label, bodyStyle("#f6f1e6", 18)));
  const fallback = options.some((item) => item.id === selected) ? selected : (options[0]?.id ?? "default");
  container.add(createMapDropdown(scene, 150, 0, 360, options, fallback, onChange).container);
  return container;
}

function createInputRow(
  scene: Phaser.Scene,
  x: number,
  y: number,
  label: string,
  selected: InputProfileId,
  onChange: (input: InputProfileId) => void,
): Phaser.GameObjects.Container {
  const container = scene.add.container(x, y);
  const options = inputProfileOptions(scene);
  const fallback = options.some((item) => item.id === selected) ? selected : "keyboard";
  container.add(scene.add.text(0, 8, label, bodyStyle("#f6f1e6", 18)));
  container.add(createMapDropdown(scene, 150, 0, 360, options, fallback, onChange).container);
  return container;
}

function createBattleProfileRow(
  scene: Phaser.Scene,
  x: number,
  y: number,
  label: string,
  selected: BattleProfile,
  onChange: (profile: BattleProfile) => void,
): Phaser.GameObjects.Container {
  const container = scene.add.container(x, y);
  container.add(scene.add.text(0, 8, label, bodyStyle("#f6f1e6", 18)));
  container.add(createMapDropdown(scene, 260, 0, 190, [
    { id: "Player1", name: t("settings.account.player1") },
    { id: "Player2", name: t("settings.account.player2") },
  ], selected, onChange).container);
  return container;
}

function sectionTitle(scene: Phaser.Scene, x: number, y: number, label: string): Phaser.GameObjects.Text {
  return scene.add.text(x, y, label, {
    ...bodyStyle("#ffcf6e", 20),
    fontStyle: "700",
  });
}

function inputProfileOptions(scene: Phaser.Scene): Array<{ readonly id: InputProfileId; readonly name: string }> {
  const options: Array<{ readonly id: InputProfileId; readonly name: string }> = [
    { id: "keyboard", name: t("settings.account.keyboard") },
    { id: "mobile", name: t("settings.account.mobileJoystick") },
  ];
  scene.input.gamepad?.gamepads.forEach((pad, index) => {
    if (!pad) return;
    options.push({
      id: `joystick:${index}`,
      name: pad.id || t("settings.account.joystickFallback", { index: index + 1 }),
    });
  });
  return options;
}

function refreshGamepadList(scene: Phaser.Scene): void {
  const gamepadPlugin = scene.input.gamepad as Phaser.Input.Gamepad.GamepadPlugin & {
    refreshPads?: () => void;
    updatePads?: () => void;
  } | undefined;
  gamepadPlugin?.refreshPads?.();
  gamepadPlugin?.updatePads?.();
}
