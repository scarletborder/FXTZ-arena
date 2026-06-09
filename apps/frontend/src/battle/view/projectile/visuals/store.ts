import Phaser from "phaser";

import type { ProjectileState } from "@repo/raid-logic";
import { Depth } from "../../../../utils/depth";

import { projectileAlpha } from "../display";
import { smoothValue } from "../../smooth";
import type {
  FighterKey,
  ProjectileDisplay,
  ProjectileSpec,
  ProjectileVisual,
} from "../types";
import { destroyVisual } from "./lifecycle";
import { average } from "./math";
import { projectileFrameRenderSize } from "./projectileFrameRenderSize";
import { drawYoumuSlashArc, type YoumuSlashArcGroup } from "./youmuSlashArc";
import type { BattleRoomMode } from "@repo/types";

export class ProjectileVisualStore {
  private readonly visuals = new Map<number, ProjectileVisual>();
  private readonly youmuSlashArcs = new Map<
    string,
    Phaser.GameObjects.Graphics
  >();

  constructor(private readonly scene: Phaser.Scene) {}

  renderImage(
    projectile: ProjectileState,
    display: ProjectileDisplay,
    spec: Extract<ProjectileSpec, { readonly kind: "image" | "fallback" }>,
    localFighterKey: FighterKey,
    battleMode: BattleRoomMode,
    rollbackBlend = 1,
  ): void {
    const visual = this.ensureImageVisual(projectile.id, display.x, display.y);
    const sprite = visual.image;
    if (spec.kind === "image") {
      sprite.setTexture(spec.frame.texture, spec.frame.frame);
      sprite.clearTint();
      sprite.setDisplaySize(
        ...projectileFrameRenderSize(projectile, display, spec.frame),
      );
    } else {
      sprite.setTexture(spec.texture);
      sprite.setTint(spec.tint);
      sprite.setDisplaySize(display.width, display.height);
    }
    sprite.setPosition(
      smoothValue(sprite.x, display.x, rollbackBlend),
      smoothValue(sprite.y, display.y, rollbackBlend),
    );
    sprite.setRotation(
      spec.kind === "fallback"
        ? projectile.angle
        : projectile.angle + Math.PI / 2,
    );
    sprite.setAlpha(
      smoothValue(
        sprite.alpha,
        projectileAlpha(projectile, localFighterKey, battleMode),
        rollbackBlend,
      ),
    );
    sprite.setVisible(true);
  }

  renderLaser(
    projectile: ProjectileState,
    display: ProjectileDisplay,
    spec: Extract<ProjectileSpec, { readonly kind: "laser" }>,
    localFighterKey: FighterKey,
    battleMode: BattleRoomMode,
    rollbackBlend = 1,
  ): void {
    const visual = this.ensureLaserVisual(projectile.id, display.x, display.y);
    const container = visual.container;
    container.removeAll(true);
    container.setPosition(
      smoothValue(container.x, display.x, rollbackBlend),
      smoothValue(container.y, display.y, rollbackBlend),
    );
    container.setRotation(projectile.angle);
    container.setAlpha(
      smoothValue(
        container.alpha,
        projectileAlpha(projectile, localFighterKey, battleMode),
        rollbackBlend,
      ),
    );
    container.setVisible(true);

    const length = display.width;
    if (projectile.laserRenderMode === "tiled") {
      addTiledLaserImages(this.scene, container, display, spec.frame);
    } else {
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
  }

  renderYoumuSlashArcs(
    groups: readonly YoumuSlashArcGroup[],
    rollbackBlend = 1,
  ): void {
    for (const group of groups) {
      if (group.segments.length === 0) {
        continue;
      }
      const graphics = this.ensureYoumuSlashArcVisual(group.key);
      graphics.setAlpha(
        smoothValue(
          graphics.alpha,
          average(group.segments.map((segment) => segment.alpha)),
          rollbackBlend,
        ),
      );
      graphics.setVisible(true);
      drawYoumuSlashArc(graphics, group.segments);
    }
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

  pruneYoumuSlashArcs(active: ReadonlySet<string>): void {
    for (const [key, graphics] of this.youmuSlashArcs) {
      if (!active.has(key)) {
        graphics.destroy();
        this.youmuSlashArcs.delete(key);
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

  private ensureYoumuSlashArcVisual(key: string): Phaser.GameObjects.Graphics {
    const existing = this.youmuSlashArcs.get(key);
    if (existing) {
      return existing;
    }
    const graphics = this.scene.add.graphics().setDepth(Depth.Projectile);
    this.youmuSlashArcs.set(key, graphics);
    return graphics;
  }
}

function addTiledLaserImages(
  scene: Phaser.Scene,
  container: Phaser.GameObjects.Container,
  display: ProjectileDisplay,
  frame: Extract<ProjectileSpec, { readonly kind: "laser" }>["frame"],
): void {
  const visualThickness = display.height * (frame.width / frame.hitWidth);
  const scale = visualThickness / frame.width;
  const tileLength = Math.max(1, frame.height * scale);
  const tileCount = Math.max(1, Math.ceil(display.width / tileLength));
  const startX = -display.width / 2;

  for (let index = 0; index < tileCount; index += 1) {
    const remaining = display.width - index * tileLength;
    const segmentLength = Math.min(tileLength, remaining);
    const image = scene.add
      .image(
        startX + index * tileLength + segmentLength / 2,
        0,
        frame.texture,
        frame.frame,
      )
      .setOrigin(0.5)
      .setRotation(Math.PI / 2)
      .setDisplaySize(visualThickness, segmentLength);
    container.add(image);
  }
}
