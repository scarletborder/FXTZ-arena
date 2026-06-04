import Phaser from "phaser";

import {
  ARENA_BOTTOM,
  ARENA_HEIGHT_PX,
  ARENA_LEFT,
  ARENA_RIGHT,
  ARENA_TOP,
  ARENA_WIDTH_PX,
} from "@repo/constants";

export type BattleViewMode = "ai" | "training" | "online";

const ARENA_BACKGROUND_TEXTURE = "arena-standard-bg";
const BACKGROUND_PAN_LERP = 0.08;

export class BattleStage {
  private readonly background: Phaser.GameObjects.Image | undefined;
  private readonly backgroundWidth: number;
  private readonly backgroundHeight: number;

  constructor(scene: Phaser.Scene) {
    let hasBackground = false;
    if (scene.textures.exists(ARENA_BACKGROUND_TEXTURE)) {
      hasBackground = true;
      const texture = scene.textures.get(ARENA_BACKGROUND_TEXTURE);
      const source = texture.getSourceImage() as
        | HTMLImageElement
        | HTMLCanvasElement
        | undefined;
      this.backgroundWidth = source?.width ?? ARENA_WIDTH_PX;
      this.backgroundHeight = source?.height ?? ARENA_HEIGHT_PX;
      this.background = scene.add
        .image(ARENA_LEFT, ARENA_TOP, ARENA_BACKGROUND_TEXTURE)
        .setOrigin(0, 0)
        .setDepth(0);
      const maskShape = scene.add.graphics();
      maskShape.setVisible(false);
      maskShape.fillStyle(0xffffff, 1);
      maskShape.fillRect(
        ARENA_LEFT,
        ARENA_TOP,
        ARENA_WIDTH_PX,
        ARENA_HEIGHT_PX,
      );
      this.background.setMask(maskShape.createGeometryMask());
    } else {
      this.backgroundWidth = ARENA_WIDTH_PX;
      this.backgroundHeight = ARENA_HEIGHT_PX;
      const fallback = scene.add.graphics().setDepth(0);
      fallback.fillStyle(0x07131b, 1);
      fallback.fillRect(
        ARENA_LEFT,
        ARENA_TOP,
        ARENA_WIDTH_PX,
        ARENA_HEIGHT_PX,
      );
    }

    createStageOverlay(scene, hasBackground);
  }

  render(
    player: { readonly x: number; readonly y: number },
    target: { readonly x: number; readonly y: number },
  ): void {
    if (!this.background) return;

    const midX = (player.x + target.x) / 2;
    const midY = (player.y + target.y) / 2;
    const tx = Phaser.Math.Clamp(midX / ARENA_WIDTH_PX, 0, 1);
    const ty = Phaser.Math.Clamp(midY / ARENA_HEIGHT_PX, 0, 1);
    const overflowX = Math.max(0, this.backgroundWidth - ARENA_WIDTH_PX);
    const overflowY = Math.max(0, this.backgroundHeight - ARENA_HEIGHT_PX);
    const targetX = ARENA_LEFT - overflowX * tx;
    const targetY = ARENA_TOP - overflowY * ty;

    this.background.x += (targetX - this.background.x) * BACKGROUND_PAN_LERP;
    this.background.y += (targetY - this.background.y) * BACKGROUND_PAN_LERP;
  }
}

export function createBattleStage(
  scene: Phaser.Scene,
  mode: BattleViewMode,
): BattleStage {
  void mode;
  return new BattleStage(scene);
}

function createStageOverlay(scene: Phaser.Scene, hasBackground: boolean): void {
  const bg = scene.add.graphics().setDepth(1);
  if (!hasBackground) {
    bg.fillStyle(0x07131b, 0.12);
    bg.fillRect(ARENA_LEFT, ARENA_TOP, ARENA_WIDTH_PX, ARENA_HEIGHT_PX);
    bg.lineStyle(1, 0x203141, 0.35);
    for (let x = ARENA_LEFT; x <= ARENA_RIGHT; x += 60) {
      bg.lineBetween(x, ARENA_TOP, x, ARENA_BOTTOM);
    }
    for (let y = ARENA_TOP; y <= ARENA_BOTTOM; y += 60) {
      bg.lineBetween(ARENA_LEFT, y, ARENA_RIGHT, y);
    }
  }
  bg.lineStyle(2, 0x335267, 0.9);
  bg.strokeRect(ARENA_LEFT, ARENA_TOP, ARENA_WIDTH_PX, ARENA_HEIGHT_PX);
}
