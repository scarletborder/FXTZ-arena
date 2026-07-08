import Phaser from "phaser";

import type { MobState } from "@repo/types";

import { Depth } from "../../../utils/depth";
import { smoothValue } from "../smooth";
import { clampRatio } from "./math";

const MIN_HEALTH_RING_DIAMETER = 44;

export class MobHealthRingView {
  private readonly healthRings = new Map<number, Phaser.GameObjects.Graphics>();

  constructor(private readonly scene: Phaser.Scene) {}

  render(
    mob: MobState,
    x: number,
    y: number,
    mobWidth: number,
    mobHeight: number,
    rollbackBlend: number,
  ): void {
    const shouldRender =
      (mob.class === "elite" || mob.class === "boss") && mob.spellCard;
    let ring = this.healthRings.get(mob.id);
    if (!shouldRender || !mob.spellCard) {
      ring?.setVisible(false);
      return;
    }

    if (!ring) {
      ring = this.scene.add
        .graphics()
        .setDepth(Depth.GrazeCircle)
        .setVisible(true);
      this.healthRings.set(mob.id, ring);
    }

    const radius =
      Math.max(mobWidth, mobHeight, mob.hitRadius * 2, MIN_HEALTH_RING_DIAMETER) *
      0.56;
    const ratio = clampRatio(
      mob.spellCard.currentHealth / mob.spellCard.maxHealth,
    );
    const start = -Math.PI / 2;
    const end = start - Math.PI * 2 * ratio;
    ring.setPosition(
      smoothValue(ring.x, x, rollbackBlend),
      smoothValue(ring.y, y, rollbackBlend),
    );
    ring.clear();
    ring.lineStyle(5, 0x25151b, 0.72);
    ring.strokeCircle(0, 0, radius);
    ring.lineStyle(4, 0xf04444, 0.95);
    ring.beginPath();
    ring.arc(0, 0, radius, start, end, true);
    ring.strokePath();

    if (mob.spellCard.phase === "non_spell" && mob.spellCard.maxHealth > 0) {
      const markerRatio = clampRatio(
        mob.spellCard.nonSpellThresholdHealth / mob.spellCard.maxHealth,
      );
      const markerAngle = start + Math.PI * 2 * markerRatio;
      const inner = radius - 8;
      const outer = radius + 8;
      ring.lineStyle(3, 0x5dc8ff, 1);
      ring.lineBetween(
        Math.cos(markerAngle) * inner,
        Math.sin(markerAngle) * inner,
        Math.cos(markerAngle) * outer,
        Math.sin(markerAngle) * outer,
      );
    }
    ring.setAlpha(1);
    ring.setVisible(true);
  }

  removeInactive(activeIds: ReadonlySet<number>): void {
    for (const [id, ring] of this.healthRings) {
      if (!activeIds.has(id)) {
        ring.destroy();
        this.healthRings.delete(id);
      }
    }
  }
}
