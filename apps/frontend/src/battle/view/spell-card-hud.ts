import Phaser from "phaser";

import { t } from "@repo/i18n";
import type { MobState } from "@repo/types";
import { Depth } from "../../utils/depth";

interface SpellCardHudRow {
  readonly label: Phaser.GameObjects.Text;
  readonly stars: Phaser.GameObjects.Star[];
  readonly timer: Phaser.GameObjects.Text;
}

export class SpellCardHud {
  private readonly rows = new Map<number, SpellCardHudRow>();

  constructor(private readonly scene: Phaser.Scene) {}

  render(neutralMobs: readonly MobState[]): void {
    const specialMobs = neutralMobs
      .filter(
        (mob) =>
          mob.active &&
          (mob.class === "elite" || mob.class === "boss") &&
          mob.spellCard,
      )
      .sort((left, right) => left.id - right.id);
    const activeIds = new Set(specialMobs.map((mob) => mob.id));

    specialMobs.forEach((mob, index) => {
      const row = this.ensureRow(mob.id);
      const y = 20 + index * 28;
      const name = mob.displayName ?? mob.kind;
      row.label.setPosition(18, y).setText(`${name}:`);

      const spellCard = mob.spellCard!;
      this.syncStars(row, spellCard.remainingSpellCards, 118, y + 9);
      row.timer
        .setPosition(234, y)
        .setText(
          spellCard.phase === "spell_card"
            ? t("battle.spell_seconds", {
                seconds: (spellCard.remainingTicks / 60).toFixed(1),
              })
            : "",
        )
        .setVisible(spellCard.phase === "spell_card");
    });

    for (const [id, row] of this.rows) {
      if (!activeIds.has(id)) {
        destroyRow(row);
        this.rows.delete(id);
      }
    }
  }

  private ensureRow(id: number): SpellCardHudRow {
    const existing = this.rows.get(id);
    if (existing) {
      return existing;
    }
    const label = this.scene.add
      .text(18, 20, "", {
        fontFamily: "Arial, 'Microsoft YaHei', sans-serif",
        fontSize: "16px",
        color: "#fff8ee",
        stroke: "#182032",
        strokeThickness: 4,
      })
      .setDepth(Depth.OnlineStatus)
      .setScrollFactor(0);
    const timer = this.scene.add
      .text(234, 20, "", {
        fontFamily: "Arial, 'Microsoft YaHei', sans-serif",
        fontSize: "15px",
        color: "#85d8ff",
        stroke: "#182032",
        strokeThickness: 4,
      })
      .setDepth(Depth.OnlineStatus)
      .setScrollFactor(0);
    const row = { label, stars: [], timer };
    this.rows.set(id, row);
    return row;
  }

  private syncStars(
    row: SpellCardHudRow,
    count: number,
    x: number,
    y: number,
  ): void {
    while (row.stars.length < count) {
      row.stars.push(
        this.scene.add
          .star(0, 0, 5, 4, 8, 0xffd66d, 1)
          .setStrokeStyle(2, 0x583c15, 0.9)
          .setDepth(Depth.OnlineStatus)
          .setScrollFactor(0),
      );
    }
    for (let index = 0; index < row.stars.length; index += 1) {
      const star = row.stars[index]!;
      star.setPosition(x + index * 18, y);
      star.setVisible(index < count);
    }
  }
}

function destroyRow(row: SpellCardHudRow): void {
  row.label.destroy();
  row.timer.destroy();
  for (const star of row.stars) {
    star.destroy();
  }
}
