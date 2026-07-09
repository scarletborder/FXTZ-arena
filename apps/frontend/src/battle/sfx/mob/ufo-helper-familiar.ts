import Phaser from "phaser";

import type { MobState } from "@repo/types";

import { Depth } from "../../../utils/depth";

export interface UfoHelperFamiliarVisual {
  readonly root: Phaser.GameObjects.Container;
  readonly hull: Phaser.GameObjects.Graphics;
  readonly windows: Phaser.GameObjects.Graphics;
}

export function createUfoHelperFamiliarVisual(
  scene: Phaser.Scene,
): UfoHelperFamiliarVisual {
  const root = scene.add.container(0, 0).setDepth(Depth.Character);
  const hull = scene.add.graphics();
  const windows = scene.add.graphics();
  root.add([hull, windows]);
  return { root, hull, windows };
}

export function renderUfoHelperFamiliarVisual(
  visual: UfoHelperFamiliarVisual,
  mob: MobState,
  x: number,
  y: number,
  alpha: number,
): void {
  const size = Math.max(
    24,
    Math.max(mob.hitWidth ?? 0, mob.hitHeight ?? 0, mob.hitRadius * 2),
  );
  const halfW = size * 0.62;

  visual.root.setPosition(x, y);
  visual.root.setSize(size * 1.8, size * 1.15);
  visual.root.setAlpha(alpha);
  visual.root.setVisible(true);
  visual.hull.setRotation(0);
  visual.windows.setRotation(0);

  visual.hull.clear();
  visual.hull.fillStyle(0x8dff8b, 0.12);
  visual.hull.fillEllipse(0, 0, size * 1.8, size * 1.15);
  visual.hull.lineStyle(5, 0xc5ff59, 0.18);
  visual.hull.strokeEllipse(0, 0, size * 1.55, size * 0.96);
  visual.hull.fillStyle(0x2cbf68, 0.98);
  visual.hull.fillEllipse(0, 1, size * 1.45, size * 0.76);
  visual.hull.fillStyle(0x59ef8e, 0.95);
  visual.hull.fillEllipse(0, -size * 0.14, size * 0.84, size * 0.42);
  visual.hull.lineStyle(2, 0xe8ffd1, 0.7);
  visual.hull.strokeEllipse(0, -size * 0.14, size * 0.84, size * 0.42);
  visual.hull.lineStyle(3, 0x124e2f, 0.42);
  visual.hull.lineBetween(
    -halfW * 0.92,
    size * 0.08,
    halfW * 0.92,
    size * 0.08,
  );

  visual.windows.clear();
  visual.windows.fillStyle(0xffe97a, 0.95);
  const offsets = [-size * 0.38, -size * 0.13, size * 0.13, size * 0.38];
  for (const offset of offsets) {
    visual.windows.fillCircle(offset, size * 0.05, Math.max(2.5, size * 0.085));
  }
  visual.windows.lineStyle(1.5, 0xfff8d6, 0.95);
  for (const offset of offsets) {
    visual.windows.strokeCircle(
      offset,
      size * 0.05,
      Math.max(2.5, size * 0.085),
    );
  }
}
