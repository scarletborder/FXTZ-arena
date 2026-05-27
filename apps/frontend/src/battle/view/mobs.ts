import Phaser from "phaser";

import type { NeutralMobState } from "@repo/types";
import { Depth } from "../../utils/depth";

/** Sprite display size is slightly larger than the hit circle. */
const SPRITE_SIZE = 76;

/**
 * Selects the mob texture and flip based on movement direction.
 *
 * Front-facing (|dx| <= |dy|): front texture, no flip.
 * Sideways (|dx| > |dy|): side texture, flipped when moving right.
 */
function mobTextureConfig(mob: NeutralMobState): { readonly frame: number; readonly flipX: boolean } {
  const dx = mob.x - mob.previousX;
  const dy = mob.y - mob.previousY;
  const absDx = Math.abs(dx);
  const absDy = Math.abs(dy);
  const isSideways = absDx > absDy && absDx > 0.5;
  if (isSideways) {
    return { frame: 1, flipX: dx > 0 };
  }
  return { frame: 0, flipX: false };
}

export class MobView {
  private readonly sprites = new Map<number, Phaser.GameObjects.Sprite>();
  private readonly damageTags = new Map<number, Phaser.GameObjects.Text>();

  constructor(private readonly scene: Phaser.Scene) {}

  render(neutralMobs: readonly NeutralMobState[], alpha = 1): void {
    const active = new Set<number>();

    for (const mob of neutralMobs) {
      if (!mob.active) {
        continue;
      }
      active.add(mob.id);

      const config = mobTextureConfig(mob);
      const x = lerp(mob.previousX, mob.x, alpha);
      const y = lerp(mob.previousY, mob.y, alpha);
      let sprite = this.sprites.get(mob.id);
      if (!sprite) {
        sprite = this.scene.add.sprite(x, y, "mob-example-fairy", config.frame)
          .setOrigin(0.5)
          .setDepth(Depth.Character)
          .setDisplaySize(SPRITE_SIZE, SPRITE_SIZE);
        this.sprites.set(mob.id, sprite);
      }
      sprite.setPosition(x, y);
      sprite.setFrame(config.frame);
      sprite.setFlipX(config.flipX);
      sprite.setAlpha(1);
      sprite.setVisible(true);

      let damageTag = this.damageTags.get(mob.id);
      if (mob.kind === "immortal_fairy") {
        if (!damageTag) {
          damageTag = this.scene.add.text(x, y - 28, "", {
            fontFamily: "Arial, 'Microsoft YaHei', sans-serif",
            fontSize: "13px",
            color: "#f6f1e6",
            stroke: "#15203a",
            strokeThickness: 3,
          }).setOrigin(0.5).setDepth(Depth.FloatingText);
          this.damageTags.set(mob.id, damageTag);
        }
        damageTag.setPosition(x, y - 28);
        damageTag.setText(`[${Math.max(0, Math.floor(mob.damageTaken ?? 0))}]`);
        damageTag.setAlpha(1);
        damageTag.setVisible(true);
      } else if (damageTag) {
        damageTag.setVisible(false);
      }

    }

    // Cleanup destroyed mobs
    for (const [id, sprite] of this.sprites) {
      if (!active.has(id)) {
        sprite.destroy();
        this.sprites.delete(id);
      }
    }
    for (const [id, damageTag] of this.damageTags) {
      if (!active.has(id)) {
        damageTag.destroy();
        this.damageTags.delete(id);
      }
    }
  }
}

function lerp(from: number, to: number, alpha: number): number {
  return from + (to - from) * alpha;
}
