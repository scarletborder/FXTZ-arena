import Phaser from "phaser";

import { PLAYER_CORE_RADIUS } from "@repo/constants";
import type { FighterKey, FighterState } from "@repo/raid-logic";

interface FighterVisual {
  readonly body: Phaser.GameObjects.Sprite;
  readonly core: Phaser.GameObjects.Arc;
  readonly statusTag: Phaser.GameObjects.Text;
}

const COMBAT_DISPLAY_SIZE = 104;
const ANIMATION_FRAME_TICKS = 10;

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
  ): void {
    this.updateFighter(this.visuals.player, player, frame, gameOver, infoHeld, localFighterKey === "Player1", alpha);
    this.updateFighter(this.visuals.target, target, frame, gameOver, infoHeld, localFighterKey === "Player2", alpha);
  }

  private createFighterVisual(x: number, y: number): FighterVisual {
    const body = this.scene.add
      .sprite(x, y, "fighter-player")
      .setOrigin(0.5)
      .setDisplaySize(COMBAT_DISPLAY_SIZE, COMBAT_DISPLAY_SIZE)
      .setDepth(4);
    const core = this.scene.add.circle(x, y, PLAYER_CORE_RADIUS, 0xff4242, 1).setStrokeStyle(1, 0xffb2b2, 0.9).setDepth(5);
    const statusTag = this.scene.add.text(x, y - 48, "", {
      fontFamily: "Arial, 'Microsoft YaHei', sans-serif",
      fontSize: "14px",
      color: "#f6f1e6",
    }).setOrigin(0.5).setDepth(6);
    return { body, core, statusTag };
  }

  private updateFighter(
    visual: FighterVisual,
    fighter: FighterState,
    frame: number,
    gameOver: boolean,
    infoHeld: boolean,
    isPlayer: boolean,
    alpha: number,
  ): void {
    const visible = gameOver ? fighter.deadUntil === 0 : fighter.deadUntil === 0 || isPlayer;
    const x = lerp(fighter.previousX, fighter.x, alpha);
    const y = lerp(fighter.previousY, fighter.y, alpha);
    const facing = lerpAngle(fighter.previousFacing, fighter.facing, alpha);
    const pose = combatPoseForFacing(facing);
    const textureKey = `character-combat-${fighter.activeCharacter.id}`;
    visual.body.setPosition(x, y);
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
    visual.body.setAlpha(visible ? blinkAlpha : 0);
    visual.core.setPosition(x, y);
    visual.core.setVisible(visible);
    visual.statusTag.setPosition(x, y - 48);
    if (fighter.reloadRemaining > 0 && fighter.deadUntil === 0) {
      visual.statusTag.setText("[Reload]");
      visual.statusTag.setColor("#ffffff");
      visual.statusTag.setAlpha(Math.floor(frame / 8) % 2 === 0 ? 1 : 0.25);
    } else {
      visual.statusTag.setText(fighter.deadUntil > 0 ? "重整中" : `命数 ${Math.max(0, fighter.lives)}  bomb ${fighter.bombs}`);
      visual.statusTag.setColor("#f6f1e6");
      visual.statusTag.setAlpha(fighter.statusVisibleUntil > frame || fighter.deadUntil > 0 ? (infoHeld ? 1 : 0.9) : 0);
    }
    visual.core.setFillStyle(0xff4242, fighter.flashUntil > frame ? 0.22 : 1);
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
