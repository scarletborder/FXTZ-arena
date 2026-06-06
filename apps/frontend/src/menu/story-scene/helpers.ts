import Phaser from "phaser";
import type { CharacterDefinition } from "@repo/content";
import { t } from "@repo/i18n";

import { storyJsonKey } from "../../story/assets";
import type {
  StoryDefinition,
  StoryId,
  StoryStageReward,
} from "../../story/types";

export function getStoryFromCache(
  scene: Phaser.Scene,
  storyId: StoryId,
): StoryDefinition {
  const data = scene.cache.json.get(storyJsonKey(storyId)) as
    | StoryDefinition
    | undefined;
  if (!data) {
    throw new Error(`Missing story json: ${storyId}`);
  }
  return data;
}

export function fitImageToBounds(
  image: Phaser.GameObjects.Image,
  width: number,
  height: number,
): void {
  const sourceWidth =
    image.frame.realWidth || image.frame.width || image.width || 1;
  const sourceHeight =
    image.frame.realHeight || image.frame.height || image.height || 1;
  image.setScale(Math.min(width / sourceWidth, height / sourceHeight));
}

export function fitImageToCover(
  image: Phaser.GameObjects.Image,
  width: number,
  height: number,
): void {
  const sourceWidth =
    image.frame.realWidth || image.frame.width || image.width || 1;
  const sourceHeight =
    image.frame.realHeight || image.frame.height || image.height || 1;
  image.setScale(Math.max(width / sourceWidth, height / sourceHeight));
}

export function compactText(text: string, maxLength: number): string {
  const chars = Array.from(text);
  return chars.length <= maxLength
    ? text
    : `${chars.slice(0, Math.max(1, maxLength - 1)).join("")}...`;
}

export function wrapIndex(index: number, length: number): number {
  return ((index % length) + length) % length;
}

export function progressRatio(index: number, total: number): number {
  if (total <= 1) {
    return 0;
  }
  return Phaser.Math.Clamp(index / (total - 1), 0, 1);
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function hasReward(
  reward: StoryStageReward | undefined,
): reward is StoryStageReward {
  return (reward?.lives ?? 0) > 0 || (reward?.bombs ?? 0) > 0;
}

export function rewardLines(reward: StoryStageReward): string[] {
  const lines: string[] = [];
  if ((reward.lives ?? 0) > 0) {
    lines.push(t("story.reward_lives", { count: reward.lives }));
  }
  if ((reward.bombs ?? 0) > 0) {
    lines.push(t("story.reward_bombs", { count: reward.bombs }));
  }
  return lines;
}

export function statLevel(speed: CharacterDefinition["moveSpeed"]): number {
  return {
    low: 1,
    medium: 2,
    high: 3,
  }[speed];
}

export function statColor(speed: CharacterDefinition["moveSpeed"]): number {
  return {
    low: 0x26c6da,
    medium: 0xffcf6e,
    high: 0x34d399,
  }[speed];
}
