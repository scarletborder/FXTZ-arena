import Phaser from "phaser";
import { getAllAbilityCardDefinitions } from "@repo/content";

import { assetUrl } from "./utils/assets";
import { hasResourceAsset } from "./utils/resource-pack";

export function queueAbilityCardIconAssets(scene: Phaser.Scene): number {
  let queued = 0;

  for (const card of getAllAbilityCardDefinitions()) {
    const key = abilityCardIconTextureKey(card.id);
    if (scene.textures.exists(key) || !hasResourceAsset(card.gallery.iconAsset)) {
      continue;
    }

    scene.load.image(key, assetUrl(card.gallery.iconAsset));
    queued += 1;
  }

  return queued;
}

export function abilityCardIconTextureKey(cardId: string): string {
  return `card-icon-${cardId}`;
}
