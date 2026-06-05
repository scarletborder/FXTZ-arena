import Phaser from "phaser";

import type { AbilityCardDefinition } from "@repo/content";
import { abilityCardIconTextureKey } from "../../ability-card-assets";
import { fitImageToBounds } from "../../utils/image-fit";

export function drawCardIcon(scene: Phaser.Scene, target: Phaser.GameObjects.Container, x: number, y: number, card: AbilityCardDefinition, scale = 1): void {
  const textureKey = abilityCardIconTextureKey(card.id);
  if (scene.textures.exists(textureKey)) {
    const image = scene.add.image(x, y, textureKey).setOrigin(0.5);
    fitImageToBounds(image, 58 * scale, 58 * scale, "contain");
    target.add(image);
    return;
  }

  const graphics = scene.add.graphics();
  graphics.fillStyle(card.kind === "active" ? 0x26c6da : 0xf7b733, 1).fillCircle(x, y, 25 * scale);
  graphics.lineStyle(3 * scale, 0xf6f1e6, 1).strokeCircle(x, y, 17 * scale);
  graphics.lineStyle(3 * scale, 0x101820, 0.75).lineBetween(x - 20 * scale, y, x + 20 * scale, y);
  graphics.lineBetween(x, y - 20 * scale, x, y + 20 * scale);
  target.add(graphics);
}
