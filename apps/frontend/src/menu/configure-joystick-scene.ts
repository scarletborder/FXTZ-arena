import Phaser from "phaser";
import { t } from "@repo/i18n";

import { createBackButton, drawFightingBackdrop, headingStyle } from "./ui";
import type { SceneKey } from "./shared";
import { renderJoystickTab } from "./setting-scene/joystick-tab";
import { getEditingProfileId } from "./profile-edit-context";
import { getProfile, saveProfile } from "../store/profile-repository";

export class ConfigureJoystickScene extends Phaser.Scene {
  constructor() {
    super("configure-joystick" satisfies SceneKey);
  }

  create(): void {
    const profileId = getEditingProfileId();
    const profile = getProfile(profileId);
    drawFightingBackdrop(this, "JOYSTICK", "PROFILE");
    createBackButton(this, "profiles-manage");
    this.add.text(90, 72, t("settings.joystick"), headingStyle(42));
    const contentLayer = this.add.container(74, 150);
    const background = this.add.graphics();
    background.fillStyle(0x101820, 0.9).fillRect(0, 0, 1130, 438);
    background.lineStyle(2, 0x34475c, 0.9).strokeRect(0, 0, 1130, 438);
    contentLayer.add(background);
    renderJoystickTab(this, contentLayer, {
      initial: profile.joystick,
      onSave: (joystick) => {
        void saveProfile(profileId, { joystick });
      },
    });
  }
}
