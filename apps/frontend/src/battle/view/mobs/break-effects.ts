import Phaser from "phaser";

import { Depth } from "../../../utils/depth";
import type {
  BulletBreakVisualConfig,
  BulletBreakVisualFrame,
  BulletConfigJson,
  MobBreakEffect,
} from "./types";

export class MobBreakEffectView {
  private readonly config?: BulletBreakVisualConfig;
  private readonly effects = new Map<number, MobBreakEffect>();
  private nextEffectId = 1;

  constructor(private readonly scene: Phaser.Scene) {
    this.config = createBulletBreakAnimation(scene);
  }

  spawn(x: number, y: number, mobWidth: number, mobHeight: number): void {
    const firstFrame = this.config?.frames[0];
    if (!this.config || !firstFrame) {
      return;
    }

    const id = this.nextEffectId;
    this.nextEffectId += 1;
    const displaySize = breakEffectDisplaySize(
      this.config,
      firstFrame,
      mobWidth,
      mobHeight,
    );
    const image = this.scene.add
      .image(x, y, this.config.source, firstFrame.frame)
      .setOrigin(0.5)
      .setDepth(Depth.Effect)
      .setDisplaySize(displaySize.width, displaySize.height);
    this.effects.set(id, {
      image,
      startedAtMs: this.scene.time.now,
      displayWidth: displaySize.width,
      displayHeight: displaySize.height,
    });
  }

  render(): void {
    if (!this.config) {
      return;
    }

    const now = this.scene.time.now;
    for (const [id, effect] of this.effects) {
      const elapsedMs = now - effect.startedAtMs;
      if (elapsedMs >= this.config.totalDurationMs) {
        effect.image.destroy();
        this.effects.delete(id);
        continue;
      }

      const frame =
        this.config.frames.find(
          (candidate) => elapsedMs < candidate.endTimeMs,
        ) ?? this.config.frames[this.config.frames.length - 1];
      effect.image.setFrame(frame.frame);
      effect.image.setDisplaySize(effect.displayWidth, effect.displayHeight);
      effect.image.setVisible(true);
    }
  }
}

function breakEffectDisplaySize(
  config: BulletBreakVisualConfig,
  frame: BulletBreakVisualFrame,
  mobWidth: number,
  mobHeight: number,
): { readonly width: number; readonly height: number } {
  const mobPadding = 1.18;
  return {
    width: Math.max(frame.width * config.scaleX, mobWidth * mobPadding),
    height: Math.max(frame.height * config.scaleY, mobHeight * mobPadding),
  };
}

function createBulletBreakAnimation(
  scene: Phaser.Scene,
): BulletBreakVisualConfig | undefined {
  const config = scene.cache.json.get("bullet-config") as
    | BulletConfigJson
    | undefined;
  const breakAnim = config?.bullet_break_anim;
  if (!breakAnim || !scene.textures.exists(breakAnim.source)) {
    return undefined;
  }

  const texture = scene.textures.get(breakAnim.source);
  let elapsedMs = 0;
  const frames = breakAnim.anim.map((animFrame, index) => {
    const frameName = `bullet_break_anim_${index}`;
    const [x, y, width, height] = animFrame.frame;
    if (!texture.has(frameName)) {
      texture.add(frameName, 0, x, y, width, height);
    }
    elapsedMs += animFrame.duration * 1000;
    return {
      frame: frameName,
      width,
      height,
      endTimeMs: elapsedMs,
    };
  });

  return {
    source: breakAnim.source,
    scaleX: breakAnim.scale[0] ?? 1,
    scaleY: breakAnim.scale[1] ?? 1,
    frames,
    totalDurationMs: elapsedMs,
  };
}
