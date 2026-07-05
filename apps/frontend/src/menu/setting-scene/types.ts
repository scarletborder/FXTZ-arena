import type { SettingsScene } from "./index";

import Phaser from "phaser";

export type SettingsTabKey = "online" | "general" | "account" | "about" | "debug";

export interface SettingsTabDefinition {
  readonly key: SettingsTabKey;
  readonly label: string;
  readonly render: (scene: SettingsScene, layer: Phaser.GameObjects.Container) => void;
  readonly disabled?: (scene: Phaser.Scene) => boolean;
}

export interface SettingsSceneCleanup {
  addCleanup(cleanup: () => void): void;
}

export interface SettingsDialogHost {
  setActiveDialog(dialog: Phaser.GameObjects.Container | undefined): void;
}
