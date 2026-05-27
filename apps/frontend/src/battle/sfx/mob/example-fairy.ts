import Phaser from "phaser";

import type { NeutralMobState } from "@repo/types";

export interface ExampleFairyMobSfxParams {
  readonly mob: NeutralMobState;
}

/** Create any persistent graphics objects for the death effect (no-op). */
export function createExampleFairyDeathSfx(_scene: Phaser.Scene): Phaser.GameObjects.Graphics | null {
  return null;
}

/** Render death effect each frame (no-op). */
export function renderExampleFairyDeathSfx(_graphics: Phaser.GameObjects.Graphics, _params: ExampleFairyMobSfxParams): void {
  // No-op for ExampleFairy.
}
