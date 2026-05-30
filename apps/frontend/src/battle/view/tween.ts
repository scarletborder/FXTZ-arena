import Phaser from "phaser";

import { FIXED_STEP_MS } from "@repo/constants";

type VisualTweenTarget = {
  readonly x: number;
  readonly y: number;
  readonly alpha: number;
  readonly rotation: number;
};

type VisualTweenConfig = {
  readonly x?: number;
  readonly y?: number;
  readonly alpha?: number;
  readonly rotation?: number;
  readonly duration?: number;
};

export function tweenVisual(
  scene: Phaser.Scene,
  target: VisualTweenTarget,
  config: VisualTweenConfig,
): void {
  const duration = config.duration ?? FIXED_STEP_MS;
  scene.tweens.killTweensOf(target);

  const tweenConfig: Phaser.Types.Tweens.TweenBuilderConfig = {
    targets: target,
    duration,
    ease: "Linear",
  };

  if (config.x !== undefined) {
    tweenConfig.x = config.x;
  }
  if (config.y !== undefined) {
    tweenConfig.y = config.y;
  }
  if (config.alpha !== undefined) {
    tweenConfig.alpha = config.alpha;
  }
  if (config.rotation !== undefined) {
    tweenConfig.rotation = config.rotation;
  }

  if (
    tweenConfig.x === undefined &&
    tweenConfig.y === undefined &&
    tweenConfig.alpha === undefined &&
    tweenConfig.rotation === undefined
  ) {
    return;
  }

  scene.tweens.add(tweenConfig);
}