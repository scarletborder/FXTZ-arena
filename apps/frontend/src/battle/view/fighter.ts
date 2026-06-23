import Phaser from "phaser";
import { t } from "@repo/i18n";

import {
  ACTIVE_ABILITY_CARD_ICON_ALPHA,
  GRAZE_CIRCLE_ALPHA,
  GRAZE_CIRCLE_DIAMETER,
  PLAYER_CORE_RADIUS,
} from "@repo/constants";
import type { FighterKey, FighterState } from "@repo/raid-logic";
import { abilityCardIconTextureKey } from "../../ability-card-assets";
import { Depth } from "../../utils/depth";
import { fitImageToBounds } from "../../utils/image-fit";
import { smoothPointWithMaxStep, smoothValue } from "./smooth";

interface FighterVisual {
  readonly body: Phaser.GameObjects.Sprite;
  readonly core: Phaser.GameObjects.Arc;
  readonly shieldCore: Phaser.GameObjects.Graphics;
  readonly graze: Phaser.GameObjects.Graphics;
  readonly reloadTag: Phaser.GameObjects.Text;
  readonly resourceTag: Phaser.GameObjects.Text;
  hoverVisible: boolean;
  hoverShowTimer: Phaser.Time.TimerEvent | undefined;
  hoverHideTimer: Phaser.Time.TimerEvent | undefined;
  lastActiveCardUses: number | undefined;
}

const COMBAT_DISPLAY_SIZE = 104;
const ANIMATION_FRAME_TICKS = 10;
const HOVER_REVEAL_DELAY_MS = 120;
const HOVER_HIDE_DELAY_MS = 120;

/** Max pixels visible fighter parts may move per frame during rollback catch-up. */
const ROLLBACK_MAX_STEP = 24;
/** Errors below this threshold snap directly — imperceptible offsets don't linger. */
const ROLLBACK_SNAP_THRESHOLD = 4;

export class FighterView {
  private readonly visuals: Record<"player" | "target", FighterVisual>;

  constructor(private readonly scene: Phaser.Scene) {
    this.visuals = {
      player: this.createFighterVisual(180, 280),
      target: this.createFighterVisual(760, 280),
    };
  }

  render(
    player: FighterState,
    target: FighterState,
    frame: number,
    gameOver: boolean,
    infoHeld: boolean,
    localFighterKey: FighterKey,
    pointerX: number,
    pointerY: number,
    alpha: number,
    rollbackBlend = 1,
  ): void {
    this.updateFighter(
      this.visuals.player,
      player,
      frame,
      gameOver,
      infoHeld,
      localFighterKey === "Player1",
      pointerX,
      pointerY,
      alpha,
      rollbackBlend,
    );
    this.updateFighter(
      this.visuals.target,
      target,
      frame,
      gameOver,
      infoHeld,
      localFighterKey === "Player2",
      pointerX,
      pointerY,
      alpha,
      rollbackBlend,
    );
  }

  destroy(): void {
    for (const visual of [this.visuals.player, this.visuals.target]) {
      this.cancelTimer(visual.hoverShowTimer);
      this.cancelTimer(visual.hoverHideTimer);
      visual.body.destroy();
      visual.core.destroy();
      visual.shieldCore.destroy();
      visual.graze.destroy();
      visual.reloadTag.destroy();
      visual.resourceTag.destroy();
    }
  }

  private createFighterVisual(x: number, y: number): FighterVisual {
    const body = this.scene.add
      .sprite(x, y, "fighter-player")
      .setOrigin(0.5)
      .setDisplaySize(COMBAT_DISPLAY_SIZE, COMBAT_DISPLAY_SIZE)
      .setDepth(Depth.Character);
    const core = this.scene.add
      .circle(x, y, PLAYER_CORE_RADIUS, 0xff4242, 1)
      .setStrokeStyle(1, 0xffb2b2, 0.9)
      .setDepth(Depth.PlayerCore);
    const shieldCore = this.scene.add.graphics().setDepth(Depth.PlayerCore);
    const graze = this.scene.add.graphics().setDepth(Depth.GrazeCircle);
    const reloadTag = this.scene.add
      .text(x, y - 48, "", {
        fontFamily: "Arial, 'Microsoft YaHei', sans-serif",
        fontSize: "14px",
        color: "#f6f1e6",
      })
      .setOrigin(0.5)
      .setDepth(Depth.StatusTag);
    const resourceTag = this.scene.add
      .text(x, y + 48, "", {
        fontFamily: "Arial, 'Microsoft YaHei', sans-serif",
        fontSize: "14px",
        color: "#f6f1e6",
      })
      .setOrigin(0.5)
      .setDepth(Depth.StatusTag);
    return {
      body,
      core,
      shieldCore,
      graze,
      reloadTag,
      resourceTag,
      hoverVisible: false,
      hoverShowTimer: undefined,
      hoverHideTimer: undefined,
      lastActiveCardUses: undefined,
    };
  }

  private updateFighter(
    visual: FighterVisual,
    fighter: FighterState,
    frame: number,
    gameOver: boolean,
    infoHeld: boolean,
    isPlayer: boolean,
    pointerX: number,
    pointerY: number,
    alpha: number,
    rollbackBlend: number,
  ): void {
    const visible = gameOver
      ? fighter.deadUntil === 0
      : fighter.deadUntil === 0 || isPlayer;
    const x = lerp(fighter.previousX, fighter.x, alpha);
    const y = lerp(fighter.previousY, fighter.y, alpha);
    const facing = lerpAngle(fighter.previousFacing, fighter.facing, alpha);
    const pose = combatPoseForFacing(facing);
    const textureKey = `character-combat-${fighter.activeCharacter.id}`;
    const hasCombatTexture = this.scene.textures.exists(textureKey);
    if (visual.body.texture.key !== textureKey && hasCombatTexture) {
      visual.body.setTexture(textureKey);
      visual.body.setDisplaySize(COMBAT_DISPLAY_SIZE, COMBAT_DISPLAY_SIZE);
    }
    if (hasCombatTexture) {
      visual.body.setFrame(
        pose.column + (Math.floor(frame / ANIMATION_FRAME_TICKS) % 2) * 3,
      );
    }
    visual.body.setFlipX(pose.flipX);
    visual.body.setRotation(0);
    visual.body.setVisible(visible);
    visual.body.clearTint();
    const blinkAlpha =
      fighter.invulnerableUntil > 0 && Math.floor(frame / 5) % 2 === 0
        ? 0.28
        : 1;
    const renderPosition = smoothPointWithMaxStep(
      visual.body.x,
      visual.body.y,
      x,
      y,
      ROLLBACK_MAX_STEP,
      ROLLBACK_SNAP_THRESHOLD,
    );
    const renderX = renderPosition.x;
    const renderY = renderPosition.y;
    visual.body.setPosition(renderX, renderY);
    visual.body.setAlpha(
      visible ? smoothValue(visual.body.alpha, blinkAlpha, rollbackBlend) : 0,
    );
    this.maybeShowActiveCardIcon(visual, fighter, renderX, renderY, visible);
    visual.core.setPosition(renderX, renderY);
    visual.core.setAlpha(
      visible ? smoothValue(visual.core.alpha, 1, rollbackBlend) : 0,
    );
    visual.core.setVisible(visible);
    this.updateCoreVisual(visual, fighter, renderX, renderY, visible);
    this.updateGrazeVisual(
      visual.graze,
      fighter,
      renderX,
      renderY,
      frame,
      visible && isPlayer,
    );
    const hovered = isPointerOverFighter(pointerX, pointerY, renderX, renderY);
    this.updateHoverVisibility(visual, hovered);
    const baseResourceVisible =
      infoHeld ||
      fighter.statusVisibleUntil > frame ||
      fighter.deadUntil > 0;
    const hoverResourceVisible = visual.hoverVisible || visual.hoverHideTimer !== undefined;
    const shouldShowResource = baseResourceVisible || hoverResourceVisible;
    const resourceAlpha = baseResourceVisible ? 1 : hoverResourceVisible ? 0.92 : 0;
    visual.reloadTag.setPosition(renderX, renderY - 58);
    visual.resourceTag.setPosition(renderX, renderY + 58);
    visual.reloadTag.setAlpha(
      smoothValue(
        visual.reloadTag.alpha,
        fighter.reloadRemaining > 0 && fighter.deadUntil === 0
          ? Math.floor(frame / 8) % 2 === 0
            ? 1
            : 0.25
          : 0,
        rollbackBlend,
      ),
    );
    visual.resourceTag.setAlpha(
      smoothValue(visual.resourceTag.alpha, resourceAlpha, rollbackBlend),
    );
    visual.reloadTag.setVisible(fighter.reloadRemaining > 0 && fighter.deadUntil === 0);
    visual.resourceTag.setVisible(shouldShowResource);
    if (fighter.reloadRemaining > 0 && fighter.deadUntil === 0) {
      visual.reloadTag.setText(t("battle.reloading"));
      visual.reloadTag.setColor("#ffffff");
    } else {
      visual.reloadTag.setText("");
    }
    visual.resourceTag.setText(
      fighter.deadUntil > 0
        ? t("battle.recovering")
        : t("battle.fighter_status", {
            lives: Math.max(0, fighter.lives - 1),
            bombs: fighter.bombs,
          }),
    );
    visual.resourceTag.setColor("#f6f1e6");
    visual.core.setFillStyle(0xff4242, fighter.flashUntil > frame ? 0.22 : 1);
  }

  private maybeShowActiveCardIcon(
    visual: FighterVisual,
    fighter: FighterState,
    x: number,
    y: number,
    visible: boolean,
  ): void {
    const previousUses = visual.lastActiveCardUses;
    visual.lastActiveCardUses = fighter.activeCardUses;
    if (
      previousUses === undefined ||
      fighter.activeCardUses >= previousUses ||
      !fighter.activeCard ||
      !visible
    ) {
      return;
    }

    const textureKey = abilityCardIconTextureKey(fighter.activeCard.id);
    if (!this.scene.textures.exists(textureKey)) {
      return;
    }

    const icon = this.scene.add
      .image(x, y - 18, textureKey)
      .setOrigin(0.5)
      .setAlpha(ACTIVE_ABILITY_CARD_ICON_ALPHA)
      .setDepth(Depth.FloatingText);
    fitImageToBounds(icon, 46, 46, "contain");

    this.scene.tweens.add({
      targets: icon,
      y: y - 66,
      alpha: 0,
      duration: 620,
      ease: "Sine.easeOut",
      onComplete: () => icon.destroy(),
    });
  }

  private updateCoreVisual(
    visual: FighterVisual,
    fighter: FighterState,
    x: number,
    y: number,
    visible: boolean,
  ): void {
    visual.shieldCore.clear();
    const shieldVisible = visible && fighter.reisenShieldLayers > 0;
    visual.core.setVisible(visible && !shieldVisible);
    visual.shieldCore.setVisible(shieldVisible);
    if (!shieldVisible) {
      return;
    }

    const innerRadius = PLAYER_CORE_RADIUS;
    const outerRadius = PLAYER_CORE_RADIUS * fighter.hitCircleRadiusMultiplier;
    visual.shieldCore.fillStyle(0xff4242, 1);
    visual.shieldCore.fillCircle(x, y, innerRadius);
    visual.shieldCore.lineStyle(2, 0x5ec8ff, 0.95);
    visual.shieldCore.strokeCircle(x, y, outerRadius);
    visual.shieldCore.lineStyle(1, 0xd9f4ff, 0.9);
    for (let index = 0; index < 12; index += 1) {
      const angle = (Math.PI * 2 * index) / 12;
      const petalX = x + Math.cos(angle) * outerRadius;
      const petalY = y + Math.sin(angle) * outerRadius;
      visual.shieldCore.strokeCircle(petalX, petalY, 2.2);
    }
  }

  private updateGrazeVisual(
    graze: Phaser.GameObjects.Graphics,
    fighter: FighterState,
    x: number,
    y: number,
    frame: number,
    visible: boolean,
  ): void {
    graze.clear();
    const isAlternate =
      fighter.activeCharacter.id === fighter.alternateCharacter.id;
    if (!visible || !isAlternate) {
      graze.setVisible(false);
      return;
    }
    graze.setVisible(true);
    const multiplier = fighter.abilityCards.some(
      (card) => card.id === "graze_lover",
    )
      ? 1.5
      : 1;
    const radius = (GRAZE_CIRCLE_DIAMETER / 2) * multiplier;
    const rotation = frame * 0.035;
    graze.lineStyle(2, 0xbfefff, GRAZE_CIRCLE_ALPHA);
    for (let index = 0; index < 8; index += 1) {
      const angle = rotation + (Math.PI * 2 * index) / 8;
      const inner = radius * 0.24;
      const outer = radius;
      const ix = x + Math.cos(angle) * inner;
      const iy = y + Math.sin(angle) * inner;
      const ox = x + Math.cos(angle) * outer;
      const oy = y + Math.sin(angle) * outer;
      graze.beginPath();
      graze.moveTo(ix, iy);
      graze.lineTo(ox, oy);
      graze.strokePath();
      graze.beginPath();
      graze.arc(x, y, outer * 0.78, angle - 0.12, angle + 0.12, false);
      graze.strokePath();
    }
    graze.lineStyle(1, 0xffffff, GRAZE_CIRCLE_ALPHA * 0.72);
    graze.strokeCircle(x, y, radius);
  }

  private updateHoverVisibility(visual: FighterVisual, hovered: boolean): void {
    if (hovered) {
      this.cancelTimer(visual.hoverHideTimer);
      visual.hoverHideTimer = undefined;
      if (visual.hoverVisible || visual.hoverShowTimer) {
        return;
      }
      visual.hoverShowTimer = this.scene.time.delayedCall(HOVER_REVEAL_DELAY_MS, () => {
        visual.hoverShowTimer = undefined;
        visual.hoverVisible = true;
      });
      return;
    }

    this.cancelTimer(visual.hoverShowTimer);
    visual.hoverShowTimer = undefined;
    if (!visual.hoverVisible || visual.hoverHideTimer) {
      return;
    }
    visual.hoverHideTimer = this.scene.time.delayedCall(HOVER_HIDE_DELAY_MS, () => {
      visual.hoverHideTimer = undefined;
      visual.hoverVisible = false;
    });
  }

  private cancelTimer(timer: Phaser.Time.TimerEvent | undefined): void {
    timer?.remove(false);
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

function lerp(from: number, to: number, alpha: number): number {
  return from + (to - from) * alpha;
}

function lerpAngle(from: number, to: number, alpha: number): number {
  const delta = Math.atan2(Math.sin(to - from), Math.cos(to - from));
  return from + delta * alpha;
}

function isPointerOverFighter(
  pointerX: number,
  pointerY: number,
  fighterX: number,
  fighterY: number,
): boolean {
  return Math.hypot(pointerX - fighterX, pointerY - fighterY) <= COMBAT_DISPLAY_SIZE / 2;
}
