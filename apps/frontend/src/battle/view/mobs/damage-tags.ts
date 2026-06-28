import Phaser from "phaser";

import type { MobState } from "@repo/types";

import { Depth } from "../../../utils/depth";
import { smoothValue } from "../smooth";

export class MobDamageTagView {
  private readonly damageTags = new Map<number, Phaser.GameObjects.Text>();

  constructor(private readonly scene: Phaser.Scene) {}

  render(
    mob: MobState,
    x: number,
    y: number,
    rollbackBlend: number,
  ): void {
    let damageTag = this.damageTags.get(mob.id);
    if (mob.kind !== "immortal_fairy") {
      damageTag?.setVisible(false);
      return;
    }

    if (!damageTag) {
      damageTag = this.scene.add
        .text(x, y - 28, "", {
          fontFamily: "Arial, 'Microsoft YaHei', sans-serif",
          fontSize: "13px",
          color: "#f6f1e6",
          stroke: "#15203a",
          strokeThickness: 3,
        })
        .setOrigin(0.5)
        .setDepth(Depth.FloatingText);
      this.damageTags.set(mob.id, damageTag);
    }

    damageTag.setPosition(
      smoothValue(damageTag.x, x, rollbackBlend),
      smoothValue(damageTag.y, y - 28, rollbackBlend),
    );
    damageTag.setAlpha(smoothValue(damageTag.alpha, 1, rollbackBlend));
    damageTag.setText(`[${Math.max(0, Math.floor(mob.damageTaken ?? 0))}]`);
    damageTag.setVisible(true);
  }

  removeInactive(activeIds: ReadonlySet<number>): void {
    for (const [id, damageTag] of this.damageTags) {
      if (!activeIds.has(id)) {
        damageTag.destroy();
        this.damageTags.delete(id);
      }
    }
  }
}
