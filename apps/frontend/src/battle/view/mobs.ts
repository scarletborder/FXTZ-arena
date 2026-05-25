import Phaser from "phaser";

import type { NeutralMobState } from "@repo/types";

const SFX_FLAG_FLASH = 1;

/** Physics body size for mobs (must match physics-adapter). */
const MOB_BODY_WIDTH = 16;
const MOB_BODY_HEIGHT = 24;
/** Sprite display size = 120% of physics body. */
const SPRITE_WIDTH = MOB_BODY_WIDTH * 1.2;
const SPRITE_HEIGHT = MOB_BODY_HEIGHT * 1.2;

/**
 * Selects the mob texture and flip based on movement direction.
 *
 * Front-facing (|dx| <= |dy|): front texture, no flip.
 * Sideways (|dx| > |dy|): side texture, flipped when moving right.
 */
function mobTextureConfig(mob: NeutralMobState): { readonly texture: string; readonly flipX: boolean } {
  const dx = mob.x - mob.previousX;
  const dy = mob.y - mob.previousY;
  const absDx = Math.abs(dx);
  const absDy = Math.abs(dy);
  const isSideways = absDx > absDy && absDx > 0.5;
  if (isSideways) {
    return { texture: "mob-example-fairy-side", flipX: dx > 0 };
  }
  return { texture: "mob-example-fairy-front", flipX: false };
}

export class MobView {
  private readonly sprites = new Map<number, Phaser.GameObjects.Image>();
  private readonly flashOverlays = new Map<number, Phaser.GameObjects.Image>();
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
      let sprite = this.sprites.get(mob.id);
      if (!sprite) {
        sprite = this.scene.add.image(mob.x, mob.y, config.texture)
          .setOrigin(0.5)
          .setDepth(4)
          .setTint(0x4488ff)
          .setDisplaySize(SPRITE_WIDTH, SPRITE_HEIGHT);
        this.sprites.set(mob.id, sprite);
      } else if (sprite.texture.key !== config.texture) {
        sprite.setTexture(config.texture);
        sprite.setDisplaySize(SPRITE_WIDTH, SPRITE_HEIGHT);
      }
      sprite.setPosition(mob.x, mob.y);
      sprite.setFlipX(config.flipX);
      sprite.setAlpha(alpha);
      sprite.setVisible(true);

      let damageTag = this.damageTags.get(mob.id);
      if (mob.kind === "immortal_fairy") {
        if (!damageTag) {
          damageTag = this.scene.add.text(mob.x, mob.y - 28, "", {
            fontFamily: "Arial, 'Microsoft YaHei', sans-serif",
            fontSize: "13px",
            color: "#f6f1e6",
            stroke: "#15203a",
            strokeThickness: 3,
          }).setOrigin(0.5).setDepth(7);
          this.damageTags.set(mob.id, damageTag);
        }
        damageTag.setPosition(mob.x, mob.y - 28);
        damageTag.setText(`[${Math.max(0, Math.floor(mob.damageTaken ?? 0))}]`);
        damageTag.setAlpha(alpha);
        damageTag.setVisible(true);
      } else if (damageTag) {
        damageTag.setVisible(false);
      }

      // Flash overlay
      const flashing = (mob.sfxFlags & SFX_FLAG_FLASH) !== 0;
      let flash = this.flashOverlays.get(mob.id);
      if (flashing) {
        if (!flash) {
          flash = this.scene.add.image(mob.x, mob.y, config.texture)
            .setOrigin(0.5)
            .setDepth(5)
            .setTint(0xffffff)
            .setDisplaySize(SPRITE_WIDTH, SPRITE_HEIGHT);
          this.flashOverlays.set(mob.id, flash);
        }
        flash.setPosition(mob.x, mob.y);
        flash.setTexture(config.texture);
        flash.setFlipX(config.flipX);
        flash.setDisplaySize(SPRITE_WIDTH, SPRITE_HEIGHT);
        flash.setAlpha(alpha * 0.6);
        flash.setVisible(true);
      } else if (flash) {
        flash.setVisible(false);
      }
    }

    // Cleanup destroyed mobs
    for (const [id, sprite] of this.sprites) {
      if (!active.has(id)) {
        sprite.destroy();
        this.sprites.delete(id);
      }
    }
    for (const [id, flash] of this.flashOverlays) {
      if (!active.has(id)) {
        flash.destroy();
        this.flashOverlays.delete(id);
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
