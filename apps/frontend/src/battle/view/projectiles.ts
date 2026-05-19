import Phaser from "phaser";

import type { ProjectileState } from "@repo/raid-logic";

export class ProjectileView {
  private readonly sprites = new Map<number, Phaser.GameObjects.Image>();

  constructor(private readonly scene: Phaser.Scene) {}

  render(projectiles: readonly ProjectileState[], frame: number, alpha = 1): void {
    const active = new Set<number>();
    for (const projectile of projectiles) {
      if (frame < projectile.visibleFrom) {
        continue;
      }
      active.add(projectile.id);
      let sprite = this.sprites.get(projectile.id);
      if (!sprite) {
        sprite = this.scene.add.image(projectile.x, projectile.y, projectileTexture(projectile)).setOrigin(0.5).setDepth(3);
        this.sprites.set(projectile.id, sprite);
      }
      const display = projectileDisplay(projectile, alpha);
      sprite.setPosition(display.x, display.y);
      sprite.setRotation(projectile.angle);
      sprite.setTint(projectileTint(projectile));
      sprite.setDisplaySize(display.width, display.height);
      sprite.setAlpha(projectile.damage === 0 ? 0.85 : projectile.owner === "player" ? 0.72 : 1);
      sprite.setVisible(true);
    }

    for (const [id, sprite] of this.sprites) {
      if (!active.has(id)) {
        sprite.destroy();
        this.sprites.delete(id);
      }
    }
  }
}

const PROJECTILE_VISUAL_SIZE_BONUS = 4;

function projectileDisplay(projectile: ProjectileState, alpha: number): {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
} {
  if ((projectile.kind === "laser" || projectile.kind === "spark") && !Number.isFinite(projectile.width)) {
    const length = 1600;
    return {
      x: projectile.x + Math.cos(projectile.angle) * (length / 2),
      y: projectile.y + Math.sin(projectile.angle) * (length / 2),
      width: length,
      height: renderHeight(projectile),
    };
  }

  const width = Number.isFinite(projectile.previousWidth) && Number.isFinite(projectile.width)
    ? lerp(projectile.previousWidth, projectile.width, alpha)
    : projectile.width;
  return {
    x: lerp(projectile.previousX, projectile.x, alpha),
    y: lerp(projectile.previousY, projectile.y, alpha),
    width: renderWidth(width),
    height: renderHeight(projectile),
  };
}

function renderWidth(width: number): number {
  return Number.isFinite(width) ? width + PROJECTILE_VISUAL_SIZE_BONUS : 1600;
}

function renderHeight(projectile: ProjectileState): number {
  return projectile.height + PROJECTILE_VISUAL_SIZE_BONUS;
}

function projectileTexture(projectile: ProjectileState): string {
  if (projectile.kind === "laser" && projectile.damage === 0) {
    return "bullet-ray-preview";
  }
  return projectile.kind === "spark" ? "bullet-spark" : projectile.kind === "laser" ? "bullet-laser" : projectile.kind === "knife" ? "bullet-knife" : "bullet-orb";
}

function projectileTint(projectile: ProjectileState): number {
  if ((projectile.kind === "laser" || projectile.kind === "spark") && projectile.owner === "player" && projectile.damage === 0) {
    return 0x64b7ff;
  }
  if ((projectile.kind === "laser" || projectile.kind === "spark") && projectile.damage === 0) {
    return 0xff5a5a;
  }
  if (projectile.kind === "laser" || projectile.kind === "spark") {
    return projectile.owner === "player" ? 0xffead4 : 0xffc0c0;
  }
  return projectile.owner === "player" ? 0xdff0ff : 0xffe0e0;
}

function lerp(from: number, to: number, alpha: number): number {
  return from + (to - from) * alpha;
}
