import Phaser from "phaser";

import type { EffectState, ShieldState } from "@repo/raid-logic";
import { createClearRingSfx, renderClearRingSfx } from "../sfx";
import { Depth } from "../../utils/depth";

export class EffectsView {
  private readonly sprites = new Map<number, Phaser.GameObjects.Image>();
  private readonly rings = new Map<number, Phaser.GameObjects.Graphics>();
  private readonly shields = new Map<ShieldState["owner"], Phaser.GameObjects.Rectangle>();

  constructor(private readonly scene: Phaser.Scene) {}

  render(effects: readonly EffectState[], shields: readonly ShieldState[] = []): void {
    const active = new Set<number>();
    for (const effect of effects) {
      active.add(effect.id);
      if (effect.kind === "ring") {
        let ring = this.rings.get(effect.id);
        if (!ring) {
          ring = createClearRingSfx(this.scene, {
            color: effect.tint,
            x: effect.x,
            y: effect.y,
            radius: effect.scale * 100,
          });
          this.rings.set(effect.id, ring);
        }
        renderClearRingSfx(ring, {
          color: effect.tint,
          x: effect.x,
          y: effect.y,
          radius: effect.scale * 100,
        });
        ring.setVisible(true);
        continue;
      }
      let sprite = this.sprites.get(effect.id);
      if (!sprite) {
        sprite = this.scene.add.image(effect.x, effect.y, effect.kind === "burst" ? "effect-burst" : "effect-ring").setOrigin(0.5).setDepth(Depth.Effect);
        this.sprites.set(effect.id, sprite);
      }
      sprite.setPosition(effect.x, effect.y);
      sprite.setScale(effect.scale);
      sprite.setTint(effect.tint);
      sprite.setAlpha(effect.kind === "damage" ? 0.8 : 0.45);
      sprite.setVisible(true);
    }

    for (const [id, sprite] of this.sprites) {
      if (!active.has(id)) {
        sprite.destroy();
        this.sprites.delete(id);
      }
    }
    for (const [id, ring] of this.rings) {
      if (!active.has(id)) {
        ring.destroy();
        this.rings.delete(id);
      }
    }

    const activeShields = new Set<ShieldState["owner"]>();
    for (const shield of shields) {
      activeShields.add(shield.owner);
      let rect = this.shields.get(shield.owner);
      if (!rect) {
        rect = this.scene.add.rectangle(shield.x, shield.y, shield.width, shield.height, 0x8af7ff, 0.18).setOrigin(0.5).setDepth(Depth.Shield);
        rect.setStrokeStyle(2, 0x8af7ff, 0.95);
        rect.setBlendMode(Phaser.BlendModes.ADD);
        this.shields.set(shield.owner, rect);
      }
      rect.setPosition(shield.x, shield.y);
      rect.setSize(shield.width, shield.height);
      rect.setRotation(shield.angle);
      rect.setVisible(true);
    }
    for (const [owner, shield] of this.shields) {
      if (!activeShields.has(owner)) {
        shield.destroy();
        this.shields.delete(owner);
      }
    }
  }
}
