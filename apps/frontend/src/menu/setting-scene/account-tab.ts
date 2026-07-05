import Phaser from "phaser";
import { t } from "@repo/i18n";

import { bodyStyle, createRectangleButton } from "../ui";
import { createMapDropdown } from "../map-dialog";
import { setAccountSettings, settingsRepository } from "../../store/settings";
import { listProfiles, shortProfileHash } from "../../store/profile-repository";
import type { SettingsScene } from "./index";

type BattleProfile = "Player1" | "Player2";

export function renderAccountTab(scene: SettingsScene, layer: Phaser.GameObjects.Container): void {
  let tempSettings = { ...settingsRepository.get().account };
  const statusText = scene.add.text(36, 392, "", bodyStyle("#34d399", 16));

  const refreshSettings = () => {
    setAccountSettings(tempSettings);
    statusText.setText(t("settings.account.saveSuccess"));
  };

  layer.add(sectionTitle(scene, 36, 34, t("settings.account.localProfiles")));
  layer.add(createRectangleButton(
    scene,
    386,
    54,
    176,
    38,
    t("settings.account.manageProfiles"),
    () => scene.scene.start("profiles-manage"),
    { accent: 0x8af7ff },
  ).container);

  layer.add(createProfileRow(
    scene,
    36,
    104,
    t("settings.account.p1Profile"),
    tempSettings.p1ProfileId,
    (profileId) => {
      tempSettings = { ...tempSettings, p1ProfileId: profileId };
      refreshSettings();
    },
  ));
  layer.add(createProfileRow(
    scene,
    36,
    174,
    t("settings.account.p2Profile"),
    tempSettings.p2ProfileId,
    (profileId) => {
      tempSettings = { ...tempSettings, p2ProfileId: profileId };
      refreshSettings();
    },
  ));

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
  container.add(createMapDropdown(scene, 190, 0, 320, options, options.some((item) => item.id === selected) ? selected : "default", onChange).container);
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
