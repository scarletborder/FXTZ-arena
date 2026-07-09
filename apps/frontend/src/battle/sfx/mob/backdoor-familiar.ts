import Phaser from "phaser";

import type { MobState } from "@repo/types";

import { Depth } from "../../../utils/depth";

export interface BackdoorFamiliarVisual {
  readonly root: Phaser.GameObjects.Container;
  readonly glow: Phaser.GameObjects.Graphics;
  readonly core: Phaser.GameObjects.Graphics;
}

export function backdoorFamiliarDisplaySize(mob: MobState): {
  readonly width: number;
  readonly height: number;
} {
  const hitWidth = mob.hitWidth ?? mob.hitRadius * 2;
  const hitHeight = mob.hitHeight ?? mob.hitRadius * 2;
  return {
    width: Math.max(6, hitWidth * 0.36),
    height: Math.max(42, hitHeight * 2.4),
  };
}

export function createBackdoorFamiliarVisual(
  scene: Phaser.Scene,
): BackdoorFamiliarVisual {
  const root = scene.add.container(0, 0).setDepth(Depth.Character);
  const glow = scene.add.graphics();
  const core = scene.add.graphics();
  root.add([glow, core]);
  return { root, glow, core };
}

export function renderBackdoorFamiliarVisual(
  visual: BackdoorFamiliarVisual,
  mob: MobState,
  x: number,
  y: number,
  angle: number,
  alpha: number,
): void {
  const { width, height } = backdoorFamiliarDisplaySize(mob);
  const halfW = width / 2;
  const halfH = height / 2;

  visual.root.setPosition(x, y);
  visual.root.setSize(width, height);
  visual.root.setRotation(angle);
  visual.root.setAlpha(alpha);
  visual.root.setVisible(true);

  visual.glow.clear();
  visual.glow.fillStyle(0xffd54a, 0.16);
  visual.glow.fillRoundedRect(
    -halfW - 5,
    -halfH - 5,
    width + 10,
    height + 10,
    7,
  );
  visual.glow.lineStyle(5, 0xffd54a, 0.28);
  visual.glow.strokeRoundedRect(
    -halfW - 3,
    -halfH - 3,
    width + 6,
    height + 6,
    6,
  );

  visual.core.clear();
  visual.core.fillStyle(0xfff2ad, 0.9);
  visual.core.fillRoundedRect(-halfW, -halfH, width, height, 5);
  visual.core.lineStyle(2, 0xfffbe3, 1);
  visual.core.strokeRoundedRect(-halfW, -halfH, width, height, 5);
  visual.core.lineStyle(2, 0xffee72, 0.95);
  visual.core.lineBetween(0, -halfH + 3, 0, halfH - 3);
}
