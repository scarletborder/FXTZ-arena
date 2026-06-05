import Phaser from "phaser";
import { getAllCharacterDefinitions } from "@repo/content";

import { assetUrl } from "../utils/assets";
import { hasResourceAsset } from "../utils/resource-pack";

export function queueMenuCharacterPreviewAssets(scene: Phaser.Scene): number {
  let queued = 0;

  for (const character of getAllCharacterDefinitions()) {
    const key = characterPreviewTextureKey(character.id);
    if (scene.textures.exists(key) || !hasResourceAsset(character.gallery.attackPreviewAsset)) {
      continue;
    }

    scene.load.image(key, assetUrl(character.gallery.attackPreviewAsset));
    queued += 1;
  }

  return queued;
}

export function characterPreviewTextureKey(characterId: string): string {
  return `character-preview-${characterId}`;
}
