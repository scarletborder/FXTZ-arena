import Phaser from "phaser";

import type { CharacterDefinition } from "@repo/content";

import { characterPreviewTextureKey } from "../assets";
import { createFittedImage } from "../../utils/image-fit";

export function drawCharacterIcon(scene: Phaser.Scene, target: Phaser.GameObjects.Container, x: number, y: number, scale = 1): void {
  const graphics = scene.add.graphics();
  graphics.fillStyle(0xe33d44, 1).fillTriangle(x, y - 34 * scale, x - 30 * scale, y + 28 * scale, x + 34 * scale, y + 24 * scale);
  graphics.lineStyle(4 * scale, 0xf6f1e6, 1).strokeCircle(x, y + 6 * scale, 8 * scale);
  graphics.lineStyle(3 * scale, 0x101820, 0.9).lineBetween(x - 22 * scale, y + 12 * scale, x + 26 * scale, y - 12 * scale);
  target.add(graphics);
}

export function drawCharacterPreviewIcon(
  scene: Phaser.Scene,
  target: Phaser.GameObjects.Container,
  x: number,
  y: number,
  width: number,
  height: number,
  character: CharacterDefinition,
): void {
  const textureKey = characterPreviewTextureKey(character.id);
  if (!scene.textures.exists(textureKey)) {
    drawCharacterIcon(scene, target, x, y, Math.min(width / 82, height / 82));
    return;
  }

  const image = createFittedImage(scene, x, y, textureKey, width, height, "contain");
  image.setOrigin(0.5);
  target.add(image);
}
