import Phaser from "phaser";

import type {
  EnemyAnimationName,
  EnemyConfigJson,
  EnemyVisualConfig,
} from "./types";

export function createEnemyAnimations(
  scene: Phaser.Scene,
): ReadonlyMap<string, EnemyVisualConfig> {
  const config = scene.cache.json.get("enemy-config") as
    | EnemyConfigJson
    | undefined;
  const entries = new Map<string, EnemyVisualConfig>();
  if (!config) {
    return entries;
  }

  for (const enemy of config.enemy_config) {
    if (!scene.textures.exists(enemy.source)) {
      continue;
    }
    const texture = scene.textures.get(enemy.source);
    const animations = new Map<EnemyAnimationName, string>();

    for (const anim of enemy.anim) {
      if (!isEnemyAnimationName(anim.name)) {
        continue;
      }
      const frames = anim.anim_frames.map((frame, index) => {
        const frameName = `${enemy.id}_${anim.name}_${index}`;
        if (!texture.has(frameName)) {
          texture.add(
            frameName,
            0,
            frame.frame[0],
            frame.frame[1],
            frame.frame[2],
            frame.frame[3],
          );
        }
        return {
          key: enemy.source,
          frame: frameName,
          duration: frame.duration * 1000,
        };
      });
      const animationKey = `${enemy.id}_${anim.name}`;
      if (!scene.anims.exists(animationKey)) {
        scene.anims.create({
          key: animationKey,
          frames,
          repeat: anim.anim_type === "loop" ? -1 : 0,
        });
      }
      animations.set(anim.name, animationKey);
    }

    entries.set(enemy.id, {
      id: enemy.id,
      source: enemy.source,
      width: enemy.rect[2],
      height: enemy.rect[3],
      scaleX: enemy.scale[0],
      scaleY: enemy.scale[1],
      animations,
    });
  }

  return entries;
}

function isEnemyAnimationName(name: string): name is EnemyAnimationName {
  return name === "default" || name === "turn" || name === "move";
}
