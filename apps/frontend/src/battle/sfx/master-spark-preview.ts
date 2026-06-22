import Phaser from "phaser";

import { Depth } from "../../utils/depth";

export interface MasterSparkPreviewSfxParams {
  readonly color: number;
  readonly x: number;
  readonly y: number;
  readonly angle: number;
  readonly length: number;
  readonly width: number;
  readonly alpha?: number;
}

export function createMasterSparkPreviewSfx(
  scene: Phaser.Scene,
  params: MasterSparkPreviewSfxParams,
): Phaser.GameObjects.Graphics {
  const graphics = scene.add.graphics().setDepth(Depth.ProjectilePreview);
  renderMasterSparkPreviewSfx(graphics, params);
  return graphics;
}

export function renderMasterSparkPreviewSfx(
  graphics: Phaser.GameObjects.Graphics,
  params: MasterSparkPreviewSfxParams,
): void {
  graphics.clear();
  graphics.setPosition(params.x, params.y);
  graphics.setRotation(params.angle);
  graphics.lineStyle(
    Math.max(2, params.width),
    params.color,
    params.alpha ?? 0.7,
  );
  graphics.beginPath();
  graphics.moveTo(0, 0);
  graphics.lineTo(params.length, 0);
  graphics.strokePath();
}
