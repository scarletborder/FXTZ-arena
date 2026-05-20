import Phaser from "phaser";

import type { ProjectileState } from "@repo/raid-logic";
import { OWN_PROJECTILE_ALPHA } from "@repo/constants";
import { createMasterSparkPreviewSfx, renderMasterSparkPreviewSfx } from "../sfx";

type FighterKey = ProjectileState["owner"];

export class ProjectileView {
  private readonly sprites = new Map<number, Phaser.GameObjects.Image>();
  private readonly previewLines = new Map<number, Phaser.GameObjects.Graphics>();

  constructor(private readonly scene: Phaser.Scene) {}

  render(projectiles: readonly ProjectileState[], frame: number, localFighterKey: FighterKey = "player", alpha = 1): void {
    const active = new Set<number>();
    for (const projectile of projectiles) {
      if (frame < projectile.visibleFrom) {
        continue;
      }
      active.add(projectile.id);
      if (projectile.kind === "laser" && projectile.damage === 0) {
        const display = projectileDisplay(projectile, alpha);
        let preview = this.previewLines.get(projectile.id);
        if (!preview) {
          preview = createMasterSparkPreviewSfx(this.scene, {
            color: projectileTint(projectile),
            x: projectile.x,
            y: projectile.y,
            angle: projectile.angle,
            length: display.width,
            width: display.height,
          });
          this.previewLines.set(projectile.id, preview);
        }
        renderMasterSparkPreviewSfx(preview, {
          color: projectileTint(projectile),
          x: projectile.x,
          y: projectile.y,
          angle: projectile.angle,
          length: display.width,
          width: display.height,
        });
        preview.setAlpha(projectileAlpha(projectile, localFighterKey));
        preview.setVisible(true);
        continue;
      }
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
      sprite.setAlpha(projectileAlpha(projectile, localFighterKey));
      sprite.setVisible(true);
    }

    for (const [id, sprite] of this.sprites) {
      if (!active.has(id)) {
        sprite.destroy();
        this.sprites.delete(id);
      }
    }
    for (const [id, preview] of this.previewLines) {
      if (!active.has(id)) {
        preview.destroy();
        this.previewLines.delete(id);
      }
    }
  }
}

const PROJECTILE_VISUAL_SIZE_BONUS = 4;
const PROJECTILE_PREVIEW_ALPHA = 0.85;

function projectileAlpha(projectile: ProjectileState, localFighterKey: FighterKey): number {
  if (projectile.owner === localFighterKey) {
    return OWN_PROJECTILE_ALPHA;
  }
  return projectile.damage === 0 ? PROJECTILE_PREVIEW_ALPHA : 1;
}

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
