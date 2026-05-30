import Phaser from "phaser";

import type { ProjectileState } from "@repo/raid-logic";
import { Depth } from "../../../utils/depth";

import { projectileAlpha } from "./display";
import { smoothValue } from "../smooth";
import type {
  FighterKey,
  ProjectileDisplay,
  ProjectileSpec,
  ProjectileVisual,
} from "./types";

export class ProjectileVisualStore {
  private readonly visuals = new Map<number, ProjectileVisual>();

  constructor(private readonly scene: Phaser.Scene) { }

  renderImage(
    projectile: ProjectileState,
    display: ProjectileDisplay,
    spec: Extract<ProjectileSpec, { readonly kind: "image" | "fallback" }>,
    localFighterKey: FighterKey,
    rollbackBlend = 1,
  ): void {
    const visual = this.ensureImageVisual(projectile.id, display.x, display.y);
    const sprite = visual.image;
    if (spec.kind === "image") {
      sprite.setTexture(spec.frame.texture, spec.frame.frame);
      sprite.clearTint();
      sprite.setDisplaySize(spec.frame.width, spec.frame.height);
    } else {
      sprite.setTexture(spec.texture);
      sprite.setTint(spec.tint);
      sprite.setDisplaySize(display.width, display.height);
    }
    sprite.setPosition(smoothValue(sprite.x, display.x, rollbackBlend), smoothValue(sprite.y, display.y, rollbackBlend));
    sprite.setRotation(
      spec.kind === "fallback"
        ? projectile.angle
        : projectile.angle + Math.PI / 2,
    );
    sprite.setAlpha(smoothValue(sprite.alpha, projectileAlpha(projectile, localFighterKey), rollbackBlend));
    sprite.setVisible(true);
  }

  renderLaser(
    projectile: ProjectileState,
    display: ProjectileDisplay,
    spec: Extract<ProjectileSpec, { readonly kind: "laser" }>,
    localFighterKey: FighterKey,
    rollbackBlend = 1,
  ): void {
    const visual = this.ensureLaserVisual(projectile.id, display.x, display.y);
    const container = visual.container;
    container.removeAll(true);
    container.setPosition(smoothValue(container.x, display.x, rollbackBlend), smoothValue(container.y, display.y, rollbackBlend));
    container.setRotation(projectile.angle);
    container.setAlpha(smoothValue(container.alpha, projectileAlpha(projectile, localFighterKey), rollbackBlend));
    container.setVisible(true);

    const length = display.width;
    const image = this.scene.add
      .image(0, 0, spec.frame.texture, spec.frame.frame)
      .setOrigin(0.5)
      .setRotation(Math.PI / 2)
      .setDisplaySize(
        display.height * (spec.frame.width / spec.frame.hitWidth),
        length,
      );
    container.add(image);
  }

  destroy(id: number): void {
    const visual = this.visuals.get(id);
    if (!visual) return;
    destroyVisual(visual);
    this.visuals.delete(id);
  }

  prune(active: ReadonlySet<number>): void {
    for (const [id, visual] of this.visuals) {
      if (!active.has(id)) {
        destroyVisual(visual);
        this.visuals.delete(id);
      }
    }
  }

  private ensureImageVisual(
    id: number,
    x: number,
    y: number,
  ): Extract<ProjectileVisual, { kind: "image" }> {
    const existing = this.visuals.get(id);
    if (existing?.kind === "image") {
      return existing;
    }
    if (existing) {
      destroyVisual(existing);
    }
    const image = this.scene.add
      .image(x, y, "bullet-orb")
      .setOrigin(0.5)
      .setDepth(Depth.Projectile);
    const visual = { kind: "image" as const, image };
    this.visuals.set(id, visual);
    return visual;
  }

  private ensureLaserVisual(
    id: number,
    x: number,
    y: number,
  ): Extract<ProjectileVisual, { kind: "laser" }> {
    const existing = this.visuals.get(id);
    if (existing?.kind === "laser") {
      return existing;
    }
    if (existing) {
      destroyVisual(existing);
    }
    const container = this.scene.add.container(x, y).setDepth(Depth.Projectile);
    const visual = { kind: "laser" as const, container };
    this.visuals.set(id, visual);
    return visual;
  }
}

function destroyVisual(visual: ProjectileVisual): void {
  if (visual.kind === "image") {
    visual.image.destroy();
  } else {
    visual.container.destroy(true);
  }
}
