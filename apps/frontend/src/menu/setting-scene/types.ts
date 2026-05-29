import Phaser from "phaser";

import type { SettingsScene } from "./index";

export type SettingsTabKey = "online" | "general" | "about";

export interface SettingsTabDefinition {
  readonly key: SettingsTabKey;
  readonly label: string;
  readonly render: (scene: SettingsScene, layer: Phaser.GameObjects.Container) => void;
}

export interface SettingsSceneCleanup {
  addCleanup(cleanup: () => void): void;
}
