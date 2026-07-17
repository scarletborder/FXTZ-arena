import Phaser from "phaser";

import type { ProjectileState } from "@repo/types";
import { Depth } from "../../../../utils/depth";

import { projectileAlpha, type ProjectileAlphaOptions } from "../display";
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

const RAN_TWEEN_DURATION_FRAMES = 30; // 0.5s at 60fps
const RAN_POSITION_JUMP_THRESHOLD = 50; // pixels

interface RanCompanionTween {
  fromX: number;
  fromY: number;
  until: number;
}

export class ProjectileVisualStore {
  private readonly visuals = new Map<number, ProjectileVisual>();
  private readonly youmuSlashArcs = new Map<
    string,
    Phaser.GameObjects.Graphics
  >();
  private readonly ranCompanionTweens = new Map<number, RanCompanionTween>();

  constructor(private readonly scene: Phaser.Scene) {}

  renderImage(
    projectile: ProjectileState,
    display: ProjectileDisplay,
    spec: Extract<ProjectileSpec, { readonly kind: "image" | "fallback" }>,
    localFighterKey: FighterKey,
    battleMode: BattleRoomMode,
    options: ProjectileAlphaOptions,
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
        projectileAlpha(projectile, localFighterKey, battleMode, options),
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
    options: ProjectileAlphaOptions,
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
        projectileAlpha(projectile, localFighterKey, battleMode, options),
        rollbackBlend,
      ),
    );
    container.setVisible(true);

    const length = display.width;
    if (projectile.laserRenderMode === "tiled") {
      addTiledLaserImages(this.scene, container, display, spec.frame);
    } else {
      const visualThickness =
        display.height *
        (spec.frame.width / spec.frame.hitWidth) *
        (spec.phaseProgress ?? 1);
      const image = this.scene.add
        .image(0, 0, spec.frame.texture, spec.frame.frame)
        .setOrigin(0.5)
        .setRotation(Math.PI / 2)
        .setDisplaySize(Math.max(1, visualThickness), length);
      container.add(image);
    }
  }

  renderRanCompanion(
    projectile: ProjectileState,
    display: ProjectileDisplay,
    localFighterKey: FighterKey,
    battleMode: BattleRoomMode,
    options: ProjectileAlphaOptions,
    frame: number,
    rollbackBlend = 1,
  ): void {
    const visual = this.ensureSpriteVisual(projectile.id, display.x, display.y);
    const sprite = visual.sprite;
    const rolling = frame < projectile.rollUntil;
    const texture = rolling ? "character-ran-roll" : "character-ran-combat";
    if (sprite.texture.key !== texture && this.scene.textures.exists(texture)) {
      sprite.setTexture(texture);
    }
    if (this.scene.textures.exists(texture)) {
      if (rolling) {
        sprite.setFrame(Math.floor(frame / 4) % 2);
      } else {
        // Directional frames based on movement angle, matching the layout
        // used by combatPoseForFacing: column 0=down, 1=up, 2=side,
        // with two animation steps (column + step * 3).
        const pose = combatPoseForFacing(projectile.angle);
        const animStep = Math.floor(frame / 10) % 2;
        sprite.setFrame(pose.column + animStep * 3);
        sprite.setFlipX(pose.flipX);
      }
    }

    // Position tween: when the Ran companion is reset (large position jump),
    // interpolate the visual position over 0.5s so it doesn't blink.
    const dx = projectile.x - projectile.previousX;
    const dy = projectile.y - projectile.previousY;
    const jumpDistance = Math.hypot(dx, dy);
    const existingTween = this.ranCompanionTweens.get(projectile.id);

    if (
      jumpDistance > RAN_POSITION_JUMP_THRESHOLD &&
      existingTween === undefined
    ) {
      this.ranCompanionTweens.set(projectile.id, {
        fromX: sprite.x,
        fromY: sprite.y,
        until: frame + RAN_TWEEN_DURATION_FRAMES,
      });
    }

    const activeTween = this.ranCompanionTweens.get(projectile.id);
    let targetX = display.x;
    let targetY = display.y;

    if (activeTween !== undefined) {
      if (frame < activeTween.until) {
        const elapsed = RAN_TWEEN_DURATION_FRAMES - (activeTween.until - frame);
        const t = Math.min(1, elapsed / RAN_TWEEN_DURATION_FRAMES);
        // Ease-out quad for a smooth deceleration.
        const ease = 1 - (1 - t) * (1 - t);
        targetX = activeTween.fromX + (display.x - activeTween.fromX) * ease;
        targetY = activeTween.fromY + (display.y - activeTween.fromY) * ease;
      } else {
        this.ranCompanionTweens.delete(projectile.id);
      }
    }

    sprite.setPosition(
      smoothValue(sprite.x, targetX, rollbackBlend),
      smoothValue(sprite.y, targetY, rollbackBlend),
    );
    sprite.setDisplaySize(88, 88);
    sprite.setRotation(
      rolling
        ? (frame - projectile.rollStartedAt) * 0.48
        : projectile.angle + Math.PI / 2,
    );
    sprite.setAlpha(
      smoothValue(
        sprite.alpha,
        projectileAlpha(projectile, localFighterKey, battleMode, options),
        rollbackBlend,
      ),
    );
    sprite.setVisible(true);
  }

  renderFlandreBlade(
    projectile: ProjectileState,
    display: ProjectileDisplay,
    localFighterKey: FighterKey,
    battleMode: BattleRoomMode,
    options: ProjectileAlphaOptions,
    rollbackBlend = 1,
  ): void {
    const visual = this.ensureGraphicsVisual(projectile.id);
    const graphics = visual.graphics;
    graphics.clear();
    graphics.setPosition(
      smoothValue(graphics.x, display.x, rollbackBlend),
      smoothValue(graphics.y, display.y, rollbackBlend),
    );
    graphics.setRotation(projectile.angle);
    graphics.setAlpha(
      smoothValue(
        graphics.alpha,
        projectileAlpha(projectile, localFighterKey, battleMode, options),
        rollbackBlend,
      ),
    );
    graphics.setVisible(true);

    const halfLength = display.width / 2;
    const halfHeight = display.height / 2;
    const glowHeight = Math.max(halfHeight + 6, halfHeight * 1.5);

    graphics.fillStyle(0xffd4d4, 0.35);
    graphics.fillRoundedRect(
      -halfLength,
      -glowHeight,
      display.width,
      glowHeight * 2,
      glowHeight,
    );

    graphics.fillStyle(0xff4d5f, 0.85);
    graphics.fillRoundedRect(
      -halfLength,
      -halfHeight - 2,
      display.width,
      display.height + 4,
      halfHeight + 2,
    );

    graphics.fillStyle(0x0b0909, 1);
    graphics.fillRoundedRect(
      -halfLength + 2,
      -halfHeight + 2,
      Math.max(4, display.width - 4),
      Math.max(4, display.height - 4),
      Math.max(2, halfHeight - 1),
    );

    graphics.lineStyle(2, 0xffffff, 0.8);
    graphics.strokeRoundedRect(
      -halfLength + 0.5,
      -halfHeight + 0.5,
      display.width - 1,
      display.height - 1,
      Math.max(2, halfHeight - 1),
    );
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
    this.ranCompanionTweens.delete(id);
  }

  prune(active: ReadonlySet<number>): void {
    for (const [id, visual] of this.visuals) {
      if (!active.has(id)) {
        destroyVisual(visual);
        this.visuals.delete(id);
        this.ranCompanionTweens.delete(id);
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

  private ensureSpriteVisual(
    id: number,
    x: number,
    y: number,
  ): Extract<ProjectileVisual, { kind: "sprite" }> {
    const existing = this.visuals.get(id);
    if (existing?.kind === "sprite") {
      return existing;
    }
    if (existing) {
      destroyVisual(existing);
    }
    const sprite = this.scene.add
      .sprite(x, y, "character-ran-combat")
      .setOrigin(0.5)
      .setDepth(Depth.Character + 0.15);
    const visual = { kind: "sprite" as const, sprite };
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

  private ensureGraphicsVisual(
    id: number,
  ): Extract<ProjectileVisual, { kind: "graphics" }> {
    const existing = this.visuals.get(id);
    if (existing?.kind === "graphics") {
      return existing;
    }
    if (existing) {
      destroyVisual(existing);
    }
    const graphics = this.scene.add
      .graphics()
      .setDepth(Depth.Projectile + 0.05);
    const visual = { kind: "graphics" as const, graphics };
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

function combatPoseForFacing(angle: number): {
  readonly column: 0 | 1 | 2;
  readonly flipX: boolean;
} {
  const x = Math.cos(angle);
  const y = Math.sin(angle);
  if (Math.abs(x) > Math.abs(y)) {
    return x >= 0 ? { column: 2, flipX: true } : { column: 2, flipX: false };
  }
  return y >= 0 ? { column: 0, flipX: false } : { column: 1, flipX: false };
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
