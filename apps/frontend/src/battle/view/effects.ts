import Phaser from "phaser";

import type { EffectState, ShieldState } from "@repo/raid-logic";
import { createClearRingSfx, renderClearRingSfx } from "../sfx";
import { Depth } from "../../utils/depth";

export class EffectsView {
  private readonly sprites = new Map<number, Phaser.GameObjects.Image>();
  private readonly rings = new Map<number, Phaser.GameObjects.Graphics>();
  private readonly shields = new Map<string, Phaser.GameObjects.Shape | Phaser.GameObjects.Container>();

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

    const activeShields = new Set<string>();
    for (const shield of shields) {
      activeShields.add(shield.id);
      let node = this.shields.get(shield.id);
      if (!node) {
        node =
          shield.style === "ufo_square"
            ? this.createUfoShield(shield)
            : this.createDefaultShield(shield);
        this.shields.set(shield.id, node);
      }
      this.renderShield(node, shield);
    }
    for (const [id, shield] of this.shields) {
      if (!activeShields.has(id)) {
        shield.destroy();
        this.shields.delete(id);
      }
    }
  }

  private createDefaultShield(shield: ShieldState): Phaser.GameObjects.Rectangle {
    const rect = this.scene.add
      .rectangle(shield.x, shield.y, shield.width, shield.height, 0x8af7ff, 0.18)
      .setOrigin(0.5)
      .setDepth(Depth.Shield);
    rect.setStrokeStyle(2, 0x8af7ff, 0.95);
    rect.setBlendMode(Phaser.BlendModes.ADD);
    return rect;
  }

  private createUfoShield(shield: ShieldState): Phaser.GameObjects.Container {
    const body = this.scene.add.rectangle(0, 0, shield.width, shield.height, 0x72f6ff, 0.2);
    body.setStrokeStyle(2, 0x72f6ff, 0.95);
    const inner = this.scene.add.rectangle(0, 0, shield.width * 0.62, shield.height * 0.62, 0xf7ff8a, 0.32);
    inner.setStrokeStyle(1, 0xf7ff8a, 0.85);
    const cross = this.scene.add.graphics();
    cross.lineStyle(2, 0xd9fbff, 0.95);
    cross.lineBetween(-shield.width * 0.42, 0, shield.width * 0.42, 0);
    cross.lineBetween(0, -shield.height * 0.42, 0, shield.height * 0.42);
    const container = this.scene.add
      .container(shield.x, shield.y, [body, inner, cross])
      .setDepth(Depth.Shield)
      .setBlendMode(Phaser.BlendModes.ADD);
    return container;
  }

  private renderShield(
    node: Phaser.GameObjects.Shape | Phaser.GameObjects.Container,
    shield: ShieldState,
  ): void {
    node.setPosition(shield.x, shield.y);
    node.setRotation(shield.spinAngle ?? shield.angle);
    node.setVisible(true);
    if (node instanceof Phaser.GameObjects.Rectangle) {
      node.setSize(shield.width, shield.height);
      node.setRotation(shield.angle);
    }
  }
}
