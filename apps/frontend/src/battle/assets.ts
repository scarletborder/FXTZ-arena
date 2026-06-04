import Phaser from "phaser";
import { getAllCharacterDefinitions } from "@repo/content";

import { assetUrl } from "../utils/assets";

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
  image("arena-standard-bg", assetUrl("assets/bg/arena_standard.jpg"));
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
    spritesheet(`character-combat-${character.id}`, character.gallery.combatAsset, {
      frameWidth: 512,
      frameHeight: 512,
    });
  }

  return queued;
}
