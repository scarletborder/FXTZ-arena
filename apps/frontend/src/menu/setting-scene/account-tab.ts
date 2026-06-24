import Phaser from "phaser";
import { t } from "@repo/i18n";
import { MAX_PLAYER_NAME_LENGTH } from "@repo/constants";

import { bodyStyle, createFightButton, createTextField } from "../ui";
import { createMapDropdown } from "../map-dialog";
import { InputProfileId } from "../../battle/input-controller";
import { setAccountSettings, settingsRepository } from "../../store/settings";
import type { TextFieldControl } from "../shared";
import type { SettingsScene } from "./index";

type BattleProfile = "Player1" | "Player2";

export function renderAccountTab(scene: SettingsScene, layer: Phaser.GameObjects.Container): void {
  let tempSettings = { ...settingsRepository.get().account };
  let activeField: TextFieldControl | undefined;
  const statusText = scene.add.text(36, 430, "", bodyStyle("#34d399", 16));
  let profileRows = scene.add.container(0, 0);

  const refreshSettings = () => {
    setAccountSettings(tempSettings);
    statusText.setText(t("settings.account.saveSuccess"));
  };


  const profileDropdownY = 92;
  const profileUserNameOffsetY = 50;
  const p2ProfileOffset = 148;

  const rebuildProfileRows = () => {
    refreshGamepadList(scene);
    profileRows.destroy();
    profileRows = scene.add.container(0, 0);
    profileRows.add(createProfileRow(
      scene,
      36,
      profileDropdownY,
      t("settings.account.p1Profile"),
      tempSettings.p1Profile,
      (profile) => {
        tempSettings = { ...tempSettings, p1Profile: profile };
        refreshSettings();
      },
    ));
    profileRows.add(createProfileRow(
      scene,
      36,
      p2ProfileOffset + profileDropdownY,
      t("settings.account.p2Profile"),
      tempSettings.p2Profile,
      (profile) => {
        tempSettings = { ...tempSettings, p2Profile: profile };
        refreshSettings();
      },
    ));
    layer.add(profileRows);
  };

  const activateField = (field: TextFieldControl) => {
    if (activeField === field) {
      return;
    }
    activeField?.setActive(false);
    activeField = field;
    field.setActive(true);
  };

  const createUsernameField = (
    x: number,
    y: number,
    value: string,
    onChange: (username: string) => void,
  ) => {
    const field = createTextField(scene, x, y, 280, {
      value,
      maxLength: MAX_PLAYER_NAME_LENGTH,
      onFocus: activateField,
      onChange: (username) => {
        onChange(username);
        refreshSettings();
      },
    });
    field.hitArea.on("pointerdown", () => {
      activateField(field);
      field.focus();
    });
    return field;
  };

  const p1UsernameField = createUsernameField(226, profileDropdownY + profileUserNameOffsetY, tempSettings.p1Username, (username) => {
    tempSettings = { ...tempSettings, p1Username: username };
  });
  const p2UsernameField = createUsernameField(226, profileDropdownY + p2ProfileOffset + profileUserNameOffsetY, tempSettings.p2Username, (username) => {
    tempSettings = { ...tempSettings, p2Username: username };
  });

  layer.add(sectionTitle(scene, 36, 34, t("settings.account.sectionProfiles")));
  layer.add(createFightButton(
    scene,
    318,
    44,
    150,
    36,
    t("settings.account.refreshDevices"),
    rebuildProfileRows,
    { accent: 0x34d399 },
  ).container);
  rebuildProfileRows();
  layer.add(scene.add.text(36, profileDropdownY + profileUserNameOffsetY + 8, t("settings.account.p1Username"), bodyStyle("#f6f1e6", 18)));
  layer.add(p1UsernameField.container);
  layer.add(scene.add.text(36, profileDropdownY + p2ProfileOffset + profileUserNameOffsetY + 8, t("settings.account.p2Username"), bodyStyle("#f6f1e6", 18)));
  layer.add(p2UsernameField.container);

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

  const onKeyDown = (event: KeyboardEvent) => activeField?.handleKey(event);
  const onPaste = (event: ClipboardEvent) => {
    const text = event.clipboardData?.getData("text") ?? "";
    if (activeField && text) {
      activeField.handlePaste(text);
      event.preventDefault();
    }
  };
  scene.input.keyboard?.on("keydown", onKeyDown);
  window.addEventListener("paste", onPaste);
  scene.addCleanup(() => {
    scene.input.keyboard?.off("keydown", onKeyDown);
    window.removeEventListener("paste", onPaste);
    activeField = undefined;
  });
}

function createProfileRow(
  scene: Phaser.Scene,
  x: number,
  y: number,
  label: string,
  selected: InputProfileId,
  onChange: (profile: InputProfileId) => void,
): Phaser.GameObjects.Container {
  const container = scene.add.container(x, y);
  container.add(scene.add.text(0, 8, label, bodyStyle("#f6f1e6", 18)));
  container.add(createMapDropdown(scene, 190, 0, 280, inputProfileOptions(scene), selected, onChange).container);
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

function inputProfileOptions(scene: Phaser.Scene): readonly { readonly id: InputProfileId; readonly name: string }[] {
  const options: Array<{ readonly id: InputProfileId; readonly name: string }> = [
    { id: "keyboard", name: t("settings.account.keyboard") },
    { id: "mobile", name: t("settings.account.mobileJoystick") },
  ];
  const pads = scene.input.gamepad?.gamepads ?? [];
  pads.forEach((pad, index) => {
    if (!pad) {
      return;
    }
    const name = pad.id?.trim() || t("settings.account.joystickFallback", { index: index + 1 });
    options.push({ id: `joystick:${index}`, name });
  });
  return options;
}

function refreshGamepadList(scene: Phaser.Scene): void {
  const gamepadPlugin = scene.input.gamepad as (Phaser.Input.Gamepad.GamepadPlugin & {
    refreshPads?: () => void;
    updatePads?: () => void;
  }) | undefined;
  gamepadPlugin?.refreshPads?.();
  gamepadPlugin?.updatePads?.();
}

function sectionTitle(scene: Phaser.Scene, x: number, y: number, label: string): Phaser.GameObjects.Text {
  return scene.add.text(x, y, label, {
    ...bodyStyle("#ffcf6e", 20),
    fontStyle: "700",
  });
}
