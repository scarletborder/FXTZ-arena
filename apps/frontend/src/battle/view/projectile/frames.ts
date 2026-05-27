import Phaser from "phaser";

import type { BulletConfigJson, BulletFrame } from "./types";

export function createBulletFrames(
  scene: Phaser.Scene,
): ReadonlyMap<string, BulletFrame> {
  const frames = new Map<string, BulletFrame>();
  const config = scene.cache.json.get("bullet-config") as
    | BulletConfigJson
    | undefined;
  if (!config) {
    return frames;
  }

  for (const bullet of config.bullet_config) {
    if (!scene.textures.exists(bullet.source)) {
      continue;
    }
    for (
      let offsetIndex = 0;
      offsetIndex < bullet.offset.length;
      offsetIndex += 1
    ) {
      const offset = bullet.offset[offsetIndex];
      const key = bulletFrameKey(bullet.id, offsetIndex);
      const frameName = key;
      const x = bullet.rect[0] + offset[0];
      const y = bullet.rect[1] + offset[1];
      const width = bullet.rect[2];
      const height = bullet.rect[3];
      const texture = scene.textures.get(bullet.source);
      if (!texture.has(frameName)) {
        texture.add(frameName, 0, x, y, width, height);
      }
      frames.set(key, {
        key,
        texture: bullet.source,
        frame: frameName,
        width,
        height,
        hitWidth: Number(bullet.hit_box[0]),
        hitHeight: bullet.hit_box[1],
      });
    }
  }

  addLaserMiddleFrames(scene, frames, "laser_type_1");
  return frames;
}

export function bulletFrameKey(id: string, offset: number): string {
  return `${id}_offset_${offset}`;
}

function addLaserMiddleFrames(
  scene: Phaser.Scene,
  frames: Map<string, BulletFrame>,
  id: string,
): void {
  for (let offset = 0; offset < 16; offset += 1) {
    const base = frames.get(bulletFrameKey(id, offset));
    if (!base) continue;
    const texture = scene.textures.get(base.texture);
    const baseFrame = texture.get(base.frame);
    const trim = 4;
    const frameName = `${base.frame}_middle`;
    const height = Math.max(1, base.height - trim * 2);
    if (!texture.has(frameName)) {
      texture.add(
        frameName,
        0,
        baseFrame.cutX,
        baseFrame.cutY + trim,
        base.width,
        height,
      );
    }
    frames.set(`${base.key}_middle`, {
      ...base,
      key: `${base.key}_middle`,
      frame: frameName,
      height,
    });
  }
}
