import Phaser from "phaser";

export interface ClearRingSfxParams {
  readonly color: number;
  readonly x: number;
  readonly y: number;
  readonly radius: number;
  readonly alpha?: number;
}

export function createClearRingSfx(scene: Phaser.Scene, params: ClearRingSfxParams): Phaser.GameObjects.Graphics {
  const graphics = scene.add.graphics().setDepth(2);
  renderClearRingSfx(graphics, params);
  return graphics;
}

export function renderClearRingSfx(graphics: Phaser.GameObjects.Graphics, params: ClearRingSfxParams): void {
  graphics.clear();
  graphics.setPosition(params.x, params.y);
  graphics.lineStyle(3, params.color, params.alpha ?? 0.65);
  graphics.strokeCircle(0, 0, params.radius);
  graphics.lineStyle(1, 0xffffff, 0.35);
  graphics.strokeCircle(0, 0, params.radius * 0.72);
}
