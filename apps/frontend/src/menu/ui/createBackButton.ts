import Phaser from "phaser";

import { createFightButton } from "./createFightButton";

export function createBackButton(scene: Phaser.Scene, target: string = "home"): void {
  createFightButton(scene, 1138, 62, 160, 44, "返回", () => scene.scene.start(target), { accent: 0x5c7185 });
}