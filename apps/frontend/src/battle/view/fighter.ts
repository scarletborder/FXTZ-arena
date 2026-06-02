import Phaser from "phaser";
import { t } from "@repo/i18n";

import { GRAZE_CIRCLE_ALPHA, GRAZE_CIRCLE_DIAMETER, PLAYER_CORE_RADIUS } from "@repo/constants";
import type { FighterKey, FighterState } from "@repo/raid-logic";
import { Depth } from "../../utils/depth";
import { smoothValue, smoothValueWithMaxStep } from "./smooth";

interface FighterVisual {
  readonly body: Phaser.GameObjects.Sprite;
  readonly core: Phaser.GameObjects.Arc;
  readonly graze: Phaser.GameObjects.Graphics;
  readonly statusTag: Phaser.GameObjects.Text;
}

const COMBAT_DISPLAY_SIZE = 104;
const ANIMATION_FRAME_TICKS = 10;

/** Max pixels the body sprite may move per frame during rollback catch-up (~⅓ character width). */
const ROLLBACK_MAX_STEP = 35;
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
    alpha: number,
    rollbackBlend = 1,
  ): void {
    this.updateFighter(this.visuals.player, player, frame, gameOver, infoHeld, localFighterKey === "Player1", alpha, rollbackBlend);
    this.updateFighter(this.visuals.target, target, frame, gameOver, infoHeld, localFighterKey === "Player2", alpha, rollbackBlend);
  }

  private createFighterVisual(x: number, y: number): FighterVisual {
    const body = this.scene.add
      .sprite(x, y, "fighter-player")
      .setOrigin(0.5)
      .setDisplaySize(COMBAT_DISPLAY_SIZE, COMBAT_DISPLAY_SIZE)
      .setDepth(Depth.Character);
    const core = this.scene.add.circle(x, y, PLAYER_CORE_RADIUS, 0xff4242, 1).setStrokeStyle(1, 0xffb2b2, 0.9).setDepth(Depth.PlayerCore);
    const graze = this.scene.add.graphics().setDepth(Depth.GrazeCircle);
    const statusTag = this.scene.add.text(x, y - 48, "", {
      fontFamily: "Arial, 'Microsoft YaHei', sans-serif",
      fontSize: "14px",
      color: "#f6f1e6",
    }).setOrigin(0.5).setDepth(Depth.StatusTag);
    return { body, core, graze, statusTag };
  }

  private updateFighter(
    visual: FighterVisual,
    fighter: FighterState,
    frame: number,
    gameOver: boolean,
    infoHeld: boolean,
    isPlayer: boolean,
    alpha: number,
    rollbackBlend: number,
  ): void {
    const visible = gameOver ? fighter.deadUntil === 0 : fighter.deadUntil === 0 || isPlayer;
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
      visual.body.setFrame(pose.column + (Math.floor(frame / ANIMATION_FRAME_TICKS) % 2) * 3);
    }
    visual.body.setFlipX(pose.flipX);
    visual.body.setRotation(0);
    visual.body.setVisible(visible);
    visual.body.clearTint();
    const blinkAlpha = fighter.invulnerableUntil > 0 && Math.floor(frame / 5) % 2 === 0 ? 0.28 : 1;
    const renderX = smoothValueWithMaxStep(visual.body.x, x, ROLLBACK_MAX_STEP, ROLLBACK_SNAP_THRESHOLD);
    const renderY = smoothValueWithMaxStep(visual.body.y, y, ROLLBACK_MAX_STEP, ROLLBACK_SNAP_THRESHOLD);
    visual.body.setPosition(renderX, renderY);
    visual.body.setAlpha(visible ? smoothValue(visual.body.alpha, blinkAlpha, rollbackBlend) : 0);
    visual.core.setPosition(smoothValue(visual.core.x, x, rollbackBlend), smoothValue(visual.core.y, y, rollbackBlend));
    visual.core.setAlpha(visible ? smoothValue(visual.core.alpha, 1, rollbackBlend) : 0);
    visual.core.setVisible(visible);
    this.updateGrazeVisual(visual.graze, fighter, renderX, renderY, frame, visible && isPlayer);
    const statusAlpha = fighter.reloadRemaining > 0 && fighter.deadUntil === 0
      ? Math.floor(frame / 8) % 2 === 0
        ? 1
        : 0.25
      : fighter.statusVisibleUntil > frame || fighter.deadUntil > 0
        ? infoHeld
          ? 1
          : 0.9
        : 0;
    visual.statusTag.setPosition(smoothValue(visual.statusTag.x, x, rollbackBlend), smoothValue(visual.statusTag.y, y - 48, rollbackBlend));
    visual.statusTag.setAlpha(smoothValue(visual.statusTag.alpha, statusAlpha, rollbackBlend));
    if (fighter.reloadRemaining > 0 && fighter.deadUntil === 0) {
      visual.statusTag.setText("[Reload]");
      visual.statusTag.setColor("#ffffff");
    } else {
      visual.statusTag.setText(fighter.deadUntil > 0 ? t("battle.recovering") : t("battle.fighter_status", { lives: Math.max(0, fighter.lives), bombs: fighter.bombs }));
      visual.statusTag.setColor("#f6f1e6");
    }
    visual.core.setFillStyle(0xff4242, fighter.flashUntil > frame ? 0.22 : 1);
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
    const isAlternate = fighter.activeCharacter.id === fighter.alternateCharacter.id;
    if (!visible || !isAlternate) {
      graze.setVisible(false);
      return;
    }
    graze.setVisible(true);
    const multiplier = fighter.abilityCards.some((card) => card.id === "graze_lover") ? 1.5 : 1;
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
      graze.arc(
        x,
        y,
        outer * 0.78,
        angle - 0.12,
        angle + 0.12,
        false,
      );
      graze.strokePath();
    }
    graze.lineStyle(1, 0xffffff, GRAZE_CIRCLE_ALPHA * 0.72);
    graze.strokeCircle(x, y, radius);
  }
}

function combatPoseForFacing(angle: number): { readonly column: 0 | 1 | 2; readonly flipX: boolean } {
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
