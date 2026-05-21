import Phaser from "phaser";

import type { NeutralMobState } from "@repo/types";

/**
 * ExampleFairy flash effect.
 *
 * Renders a full-white overlay when the fairy is about to fire.
 * The base MobView handles the tint-based flash; this module
 * provides additional per-frame FX hooks if needed.
 */

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
