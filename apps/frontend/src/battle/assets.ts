import Phaser from "phaser";
import { DEFAULT_MAPS, getAllAbilityCardDefinitions, getAllCharacterDefinitions } from "@repo/content";

import { assetUrl } from "../utils/assets";
import { hasResourceAsset } from "../utils/resource-pack";

export function loadPortraitAssets(scene: Phaser.Scene, onComplete?: () => void): void {
  const pendingPortraitKeys = new Set<string>();

  for (const character of getAllCharacterDefinitions()) {
    if (hasResourceAsset(character.gallery.portraitAsset)) {
      const key = `character-portrait-${character.id}`;
      if (!scene.textures.exists(key)) {
        pendingPortraitKeys.add(key);
      }
      scene.load.image(
        key,
        assetUrl(character.gallery.portraitAsset),
      );
    }
  }

  if (pendingPortraitKeys.size === 0) {
    onComplete?.();
    return;
  }

  const finishIfReady = (): void => {
    if (pendingPortraitKeys.size === 0) {
      scene.load.off("filecomplete", handleFileComplete);
      scene.load.off("loaderror", handleLoadError);
      onComplete?.();
    }
  };

  const handleFileComplete = (key: string, type: string): void => {
    if (type !== "image" || !pendingPortraitKeys.has(key)) {
      return;
    }

    pendingPortraitKeys.delete(key);
    finishIfReady();
  };

  const handleLoadError = (file: { key?: string }): void => {
    if (!file.key || !pendingPortraitKeys.has(file.key)) {
      return;
    }

    pendingPortraitKeys.delete(file.key);
    finishIfReady();
  };

  scene.load.on("filecomplete", handleFileComplete);
  scene.load.on("loaderror", handleLoadError);
}

export function queueBattleAssets(scene: Phaser.Scene): number {
  let queued = 0;

  const json = (key: string, url: string): void => {
    if (scene.cache.json.exists(key)) return;
    scene.load.json(key, url);
    queued += 1;
  };

  const image = (key: string, url: string): void => {
    if (scene.textures.exists(key)) return;
    scene.load.image(key, url);
    queued += 1;
  };

  const spritesheet = (
    key: string,
    url: string,
    frameConfig: Phaser.Types.Loader.FileTypes.ImageFrameConfig,
  ): void => {
    if (scene.textures.exists(key)) return;
    scene.load.spritesheet(key, url, frameConfig);
    queued += 1;
  };

  json("bullet-config", assetUrl("assets/bullet/bullet_config.json"));
  json("enemy-config", assetUrl("assets/enemy/enemy_config.json"));
  for (const map of DEFAULT_MAPS) {
    image(map.background.textureKey, assetUrl(map.background.assetPath));
  }
  if (!scene.cache.json.exists("sfx")) {
    scene.load.audioSprite(
      "sfx",
      assetUrl("assets/audio/th_sfx.json"),
      [assetUrl("assets/audio/th_sfx.ogg"), assetUrl("assets/audio/th_sfx.m4a")],
    );
    queued += 1;
  }

  for (const texture of [
    "bullet1",
    "bullet2",
    "bullet3",
    "bullet4",
    "bullet5",
    "etbreak",
  ]) {
    image(texture, assetUrl(`assets/bullet/${texture}.png`));
  }

  for (const texture of ["enemy", "enemy2", "enemy5", "enemy_aura"]) {
    image(texture, assetUrl(`assets/enemy/${texture}.png`));
  }
  for (const character of getAllCharacterDefinitions()) {
    spritesheet(`character-combat-${character.id}`, assetUrl(character.gallery.combatAsset), {
      frameWidth: 512,
      frameHeight: 512,
    });
  }

  for (const card of getAllAbilityCardDefinitions()) {
    if (hasResourceAsset(card.gallery.previewAsset)) {
      image(`card-preview-${card.id}`, assetUrl(card.gallery.previewAsset));
    }
  }

  return queued;
}
