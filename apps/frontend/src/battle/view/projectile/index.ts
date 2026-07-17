import Phaser from "phaser";

import type { ProjectileState } from "@repo/types";
import {
  createMasterSparkPreviewSfx,
  renderMasterSparkPreviewSfx,
} from "../../sfx";

import {
  projectileAlpha,
  projectileDisplay,
  type ProjectileAlphaOptions,
  shouldRenderPreviewLine,
} from "./display";
import { createBulletFrames } from "./frames";
import {
  projectileOwnerCharacter,
  projectileSpec,
  projectileTint,
} from "./spec";
import type {
  BulletFrame,
  FighterKey,
  ProjectileFighters,
} from "./types";
import {
  ProjectileVisualStore,
  type YoumuSlashArcGroup,
} from "./visuals";
import type { BattleRoomMode } from "@repo/types";

export class ProjectileView {
  private readonly visuals: ProjectileVisualStore;
  private readonly previewLines = new Map<
    number,
    Phaser.GameObjects.Graphics
  >();
  private readonly bulletFrames: ReadonlyMap<string, BulletFrame>;

  constructor(private readonly scene: Phaser.Scene) {
    this.visuals = new ProjectileVisualStore(scene);
    this.bulletFrames = createBulletFrames(scene);
  }

  render(
    projectiles: readonly ProjectileState[],
    frame: number,
    fighters: ProjectileFighters,
    localFighterKey: FighterKey = "Player1",
    battleMode: BattleRoomMode = "versus",
    options: ProjectileAlphaOptions = {},
    alpha = 1,
    rollbackBlend = 1,
  ): void {
    const active = new Set<number>();
    const slashGroups = new Map<string, YoumuSlashArcGroup>();
    for (const projectile of projectiles) {
      if (frame < projectile.visibleFrom) {
        continue;
      }
      active.add(projectile.id);
      if (shouldRenderPreviewLine(projectile)) {
        this.visuals.destroy(projectile.id);
        this.renderPreviewLine(
          projectile,
          alpha,
          localFighterKey,
          battleMode,
          options,
        );
        continue;
      }
      this.previewLines.get(projectile.id)?.setVisible(false);

      const ownerCharacter = projectileOwnerCharacter(projectile, fighters);
      const spec = projectileSpec(
        projectile,
        ownerCharacter,
        frame,
        this.bulletFrames,
      );
      const display = projectileDisplay(projectile, alpha);

      if (spec.kind === "youmuSlash") {
        this.visuals.destroy(projectile.id);
        const key = `${projectile.owner}:${projectile.visibleFrom}:${spec.arcIndex}`;
        const group = slashGroups.get(key) ?? { key, segments: [] };
        group.segments.push({
          display,
          angle: projectile.angle,
          alpha: projectileAlpha(
            projectile,
            localFighterKey,
            battleMode,
            options,
          ),
          segmentIndex: spec.segmentIndex,
        });
        slashGroups.set(key, group);
      } else if (spec.kind === "laser") {
        this.visuals.renderLaser(
          projectile,
          display,
          spec,
          localFighterKey,
          battleMode,
          options,
          rollbackBlend,
        );
      } else if (spec.kind === "ranCompanion") {
        this.visuals.renderRanCompanion(
          projectile,
          display,
          localFighterKey,
          battleMode,
          options,
          frame,
          rollbackBlend,
        );
      } else if (spec.kind === "flandreBlade") {
        this.visuals.renderFlandreBlade(
          projectile,
          display,
          localFighterKey,
          battleMode,
          options,
          rollbackBlend,
        );
      } else {
        this.visuals.renderImage(
          projectile,
          display,
          spec,
          localFighterKey,
          battleMode,
          options,
          rollbackBlend,
        );
      }
    }

    this.visuals.renderYoumuSlashArcs([...slashGroups.values()], rollbackBlend);
    this.visuals.prune(active);
    this.visuals.pruneYoumuSlashArcs(new Set(slashGroups.keys()));
    this.prunePreviewLines(active);
  }

  private renderPreviewLine(
    projectile: ProjectileState,
    alpha: number,
    localFighterKey: FighterKey,
    battleMode: BattleRoomMode,
    options: ProjectileAlphaOptions,
  ): void {
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
    preview.setAlpha(
      projectileAlpha(projectile, localFighterKey, battleMode, options),
    );
    preview.setVisible(true);
  }

  private prunePreviewLines(active: ReadonlySet<number>): void {
    for (const [id, preview] of this.previewLines) {
      if (!active.has(id)) {
        preview.destroy();
        this.previewLines.delete(id);
      }
    }
  }
}

export type { ProjectileFighters };
