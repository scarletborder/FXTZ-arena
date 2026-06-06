import Phaser from "phaser";

import { assetUrl } from "../utils/assets";
import { loadPortraitAssets } from "../battle/assets";
import { queueAbilityCardIconAssets } from "../ability-card-assets";
import type { StoryDialogueLine, StoryId } from "./types";

export const STORY_IDS: readonly StoryId[] = ["reimu", "marisa"];

export function storyJsonKey(storyId: StoryId): string {
  return `story-${storyId}`;
}

export function storyIconKey(iconId: string): string {
  return `story-bg-icon-${iconId}`;
}

export function queueStoryJson(scene: Phaser.Scene, storyId: StoryId): number {
  const key = storyJsonKey(storyId);
  if (scene.cache.json.exists(key)) {
    return 0;
  }
  scene.load.json(key, assetUrl(`assets/story/${storyId}.json`));
  return 1;
}

export function queueAllStoryJson(scene: Phaser.Scene): number {
  return STORY_IDS.reduce((total, id) => total + queueStoryJson(scene, id), 0);
}

/**
 * Queue all dialogue background images for a story's stages and endingScript.
 * Backgrounds with value "black" are skipped (they use a solid color rect).
 */
export function queueStoryBackgroundAssets(
  scene: Phaser.Scene,
  storyId: StoryId,
): number {
  let queued = 0;
  const key = storyJsonKey(storyId);
  const story = scene.cache.json.get(key) as
    | { readonly stages: readonly { readonly script: readonly StoryDialogueLine[] }[]; readonly endingScript: readonly StoryDialogueLine[] }
    | undefined;
  if (!story) return 0;

  const seen = new Set<string>();

  for (const stage of story.stages) {
    for (const line of stage.script) {
      const bg = line.background;
      if (bg && bg !== "black" && !seen.has(bg)) {
        seen.add(bg);
        if (!scene.textures.exists(bg)) {
          scene.load.image(bg, assetUrl(`assets/${bg}.png`));
          queued += 1;
        }
      }
    }
  }

  for (const line of story.endingScript) {
    const bg = line.background;
    if (bg && bg !== "black" && !seen.has(bg)) {
      seen.add(bg);
      if (!scene.textures.exists(bg)) {
        scene.load.image(bg, assetUrl(`assets/${bg}.png`));
        queued += 1;
      }
    }
  }

  return queued;
}

/**
 * Queue story UI assets (portraits, ability card icons, stage icons).
 * Stage icons are dynamically read from all loaded story JSONs instead of hardcoded.
 */
export function queueStoryUiAssets(scene: Phaser.Scene): number {
  let queued = 0;
  loadPortraitAssets(scene);
  queued += queueAbilityCardIconAssets(scene);

  const seenIcons = new Set<string>();

  for (const storyId of STORY_IDS) {
    const jsonKey = storyJsonKey(storyId);
    const story = scene.cache.json.get(jsonKey) as
      | { readonly stages: readonly { readonly icon: string }[] }
      | undefined;
    if (!story) continue;
    for (const stage of story.stages) {
      if (!seenIcons.has(stage.icon)) {
        seenIcons.add(stage.icon);
        const iconKey = storyIconKey(stage.icon);
        if (!scene.textures.exists(iconKey)) {
          scene.load.image(iconKey, assetUrl(`assets/bg/icon_${stage.icon}.png`));
          queued += 1;
        }
      }
    }
  }

  // Fallback when no story JSONs are in cache yet
  if (seenIcons.size === 0) {
    for (const iconId of ["hakurei_shrine", "mist_lake", "bamboo_lost", "mana_forest", "shoot_range"]) {
      const iconKey = storyIconKey(iconId);
      if (scene.textures.exists(iconKey)) continue;
      scene.load.image(iconKey, assetUrl(`assets/bg/icon_${iconId}.png`));
      queued += 1;
    }
  }

  return queued;
}
