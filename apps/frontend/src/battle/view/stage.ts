import Phaser from "phaser";

import { ARENA_HEIGHT_PX, ARENA_WIDTH_PX, type ArenaBounds, normalizeArenaBounds } from "@repo/constants";
import { getCombatMapDefinition } from "@repo/content";
import type { MapId } from "@repo/types";

export type BattleViewMode = "ai" | "training" | "online";

const BACKGROUND_PAN_LERP = 0.08;
const CAMERA_FOLLOW_LERP = 0.12;
const COLLABORATE_TILE_TEXTURE = "collaborate-generated-arena-tile";

export class BattleStage {
  private readonly bounds: ArenaBounds;
  private readonly camera: Phaser.Cameras.Scene2D.Camera;
  private readonly fixedViewport: boolean;
  private readonly background: Phaser.GameObjects.Image | undefined;
  private readonly backgroundWidth: number;
  private readonly backgroundHeight: number;

  constructor(scene: Phaser.Scene, mapId: MapId | undefined) {
    const map = getCombatMapDefinition(mapId ?? "hakurei_shrine");
    this.bounds = normalizeArenaBounds({
      width: map?.width,
      height: map?.height,
      viewportWidth: map?.viewportWidth,
      viewportHeight: map?.viewportHeight,
    });
    this.camera = scene.cameras.main;
    this.fixedViewport =
      this.bounds.width === this.bounds.viewportWidth &&
      this.bounds.height === this.bounds.viewportHeight;
    if (this.fixedViewport) {
      this.camera.removeBounds();
      this.camera.setScroll(-this.getInsetX(), -this.getInsetY());
    } else {
      this.camera.setBounds(0, 0, this.bounds.width, this.bounds.height);
    }

    const backgroundTexture = this.resolveBackgroundTexture(scene, mapId);
    let hasBackground = false;
    if (backgroundTexture && scene.textures.exists(backgroundTexture)) {
      hasBackground = true;
      if (this.fixedViewport) {
        const texture = scene.textures.get(backgroundTexture);
        const source = texture.getSourceImage() as
          | HTMLImageElement
          | HTMLCanvasElement
          | undefined;
        this.backgroundWidth = source?.width ?? ARENA_WIDTH_PX;
        this.backgroundHeight = source?.height ?? ARENA_HEIGHT_PX;
        this.background = scene.add
          .image(0, 0, backgroundTexture)
          .setOrigin(0, 0)
          .setDepth(0);
        const maskShape = scene.add.graphics();
        maskShape.setVisible(false);
        maskShape.fillStyle(0xffffff, 1);
        maskShape.fillRect(0, 0, this.bounds.viewportWidth, this.bounds.viewportHeight);
        this.background.setMask(maskShape.createGeometryMask());
      } else {
        this.backgroundWidth = this.bounds.width;
        this.backgroundHeight = this.bounds.height;
        scene.add
          .tileSprite(
            0,
            0,
            this.bounds.width,
            this.bounds.height,
            backgroundTexture,
          )
          .setOrigin(0, 0)
          .setDepth(0);
      }
    } else {
      this.backgroundWidth = this.bounds.width;
      this.backgroundHeight = this.bounds.height;
      const fallback = scene.add.graphics().setDepth(0);
      fallback.fillStyle(0x07131b, 1);
      fallback.fillRect(0, 0, this.bounds.width, this.bounds.height);
    }

    createStageOverlay(scene, this.bounds, hasBackground);
  }

  render(
    localFighter: { readonly x: number; readonly y: number },
    player: { readonly x: number; readonly y: number },
    target: { readonly x: number; readonly y: number },
  ): void {
    const insetX = this.getInsetX();
    const insetY = this.getInsetY();
    if (this.fixedViewport) {
      this.camera.setScroll(-insetX, -insetY);
      this.updateFixedBackground(player, target);
      return;
    }

    const viewLeft = Phaser.Math.Clamp(
      localFighter.x - this.bounds.viewportWidth / 2,
      0,
      Math.max(0, this.bounds.width - this.bounds.viewportWidth),
    );
    const viewTop = Phaser.Math.Clamp(
      localFighter.y - this.bounds.viewportHeight / 2,
      0,
      Math.max(0, this.bounds.height - this.bounds.viewportHeight),
    );
    const targetScrollX = viewLeft - insetX;
    const targetScrollY = viewTop - insetY;
    this.camera.setScroll(
      Phaser.Math.Linear(
        this.camera.scrollX,
        targetScrollX,
        CAMERA_FOLLOW_LERP,
      ),
      Phaser.Math.Linear(
        this.camera.scrollY,
        targetScrollY,
        CAMERA_FOLLOW_LERP,
      ),
    );
  }

  private updateFixedBackground(
    player: { readonly x: number; readonly y: number },
    target: { readonly x: number; readonly y: number },
  ): void {
    if (!this.background) {
      return;
    }
    const midX = (player.x + target.x) / 2;
    const midY = (player.y + target.y) / 2;
    const tx = Phaser.Math.Clamp(midX / this.bounds.viewportWidth, 0, 1);
    const ty = Phaser.Math.Clamp(midY / this.bounds.viewportHeight, 0, 1);
    const overflowX = Math.max(0, this.backgroundWidth - this.bounds.viewportWidth);
    const overflowY = Math.max(0, this.backgroundHeight - this.bounds.viewportHeight);
    const targetX = -overflowX * tx;
    const targetY = -overflowY * ty;

    this.background.x += (targetX - this.background.x) * BACKGROUND_PAN_LERP;
    this.background.y += (targetY - this.background.y) * BACKGROUND_PAN_LERP;
  }

  private getInsetX(): number {
    return Math.max(
      0,
      Math.round((this.camera.width - this.bounds.viewportWidth) / 2),
    );
  }

  private getInsetY(): number {
    return Math.max(
      0,
      Math.round((this.camera.height - this.bounds.viewportHeight) / 2),
    );
  }

  private resolveBackgroundTexture(
    scene: Phaser.Scene,
    mapId: MapId | undefined,
  ): string | undefined {
    if (mapId === "collaborate_test_arena") {
      ensureCollaborateTileTexture(scene);
      return COLLABORATE_TILE_TEXTURE;
    }
    return getCombatMapDefinition(mapId ?? "hakurei_shrine")?.background
      .textureKey;
  }
}

export function createBattleStage(
  scene: Phaser.Scene,
  mode: BattleViewMode,
  mapId?: MapId,
): BattleStage {
  void mode;
  return new BattleStage(scene, mapId);
}

function createStageOverlay(
  scene: Phaser.Scene,
  bounds: ArenaBounds,
  hasBackground: boolean,
): void {
  const bg = scene.add.graphics().setDepth(1);
  if (!hasBackground) {
    bg.fillStyle(0x07131b, 0.12);
    bg.fillRect(0, 0, bounds.width, bounds.height);
    bg.lineStyle(1, 0x203141, 0.35);
    for (let x = 0; x <= bounds.width; x += 60) {
      bg.lineBetween(x, 0, x, bounds.height);
    }
    for (let y = 0; y <= bounds.height; y += 60) {
      bg.lineBetween(0, y, bounds.width, y);
    }
  }
  bg.lineStyle(2, 0x335267, 0.9);
  bg.strokeRect(0, 0, bounds.width, bounds.height);
}

function ensureCollaborateTileTexture(scene: Phaser.Scene): void {
  if (scene.textures.exists(COLLABORATE_TILE_TEXTURE)) {
    return;
  }
  const texture = scene.textures.createCanvas(
    COLLABORATE_TILE_TEXTURE,
    160,
    160,
  );
  const canvas = texture?.getSourceImage() as HTMLCanvasElement | undefined;
  const ctx = canvas?.getContext("2d");
  if (!texture || !ctx) {
    return;
  }
  ctx.fillStyle = "#07131b";
  ctx.fillRect(0, 0, 160, 160);
  ctx.fillStyle = "#0d2230";
  ctx.fillRect(0, 0, 80, 80);
  ctx.fillRect(80, 80, 80, 80);
  ctx.strokeStyle = "rgba(116, 180, 206, 0.22)";
  ctx.lineWidth = 1;
  for (let x = 0; x <= 160; x += 40) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, 160);
    ctx.stroke();
  }
  for (let y = 0; y <= 160; y += 40) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(160, y);
    ctx.stroke();
  }
  ctx.strokeStyle = "rgba(255, 255, 255, 0.16)";
  ctx.strokeRect(0.5, 0.5, 159, 159);
  texture.refresh();
}
