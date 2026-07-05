import Phaser from "phaser";
import { t } from "@repo/i18n";

import { createBackButton, drawFightingBackdrop, headingStyle } from "./ui";
import type { SceneKey } from "./shared";
import { renderKeyboardTab } from "./setting-scene/keyboard-tab";
import { getEditingProfileId } from "./profile-edit-context";
import { getProfile, saveProfile } from "../store/profile-repository";

export class ConfigureKeyboardScene extends Phaser.Scene {
  private cleanupCallbacks: Array<() => void> = [];

  constructor() {
    super("configure-keyboard" satisfies SceneKey);
  }

  create(): void {
    const profileId = getEditingProfileId();
    const profile = getProfile(profileId);
    drawFightingBackdrop(this, "KEYBOARD", "PROFILE");
    createBackButton(this, "profiles-manage");
    this.add.text(90, 72, t("settings.keyboard.title"), headingStyle(42));
    const contentLayer = this.add.container(74, 150);
    const background = this.add.graphics();
    background.fillStyle(0x101820, 0.9).fillRect(0, 0, 1130, 438);
    background.lineStyle(2, 0x34475c, 0.9).strokeRect(0, 0, 1130, 438);
    contentLayer.add(background);
    renderKeyboardTab(this, contentLayer, {
      initial: profile.keybinds,
      onSave: (keybinds) => {
        void saveProfile(profileId, { keybinds });
      },
    });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.cleanupContent());
  }

  addCleanup(cleanup: () => void): void {
    this.cleanupCallbacks.push(cleanup);
  }

  private cleanupContent(): void {
    const callbacks = this.cleanupCallbacks;
    this.cleanupCallbacks = [];
    callbacks.forEach((cleanup) => cleanup());
  }
}
