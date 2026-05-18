import Phaser from "phaser";

import { PLAYER_CORE_RADIUS } from "../constants";
import type { FighterState } from "../types";

interface FighterVisual {
  readonly body: Phaser.GameObjects.Image;
  readonly core: Phaser.GameObjects.Arc;
  readonly ring: Phaser.GameObjects.Arc;
  readonly statusTag: Phaser.GameObjects.Text;
}

const TRIANGLE_CENTROID_TEXTURE_Y = (24 + 208 + 208) / 3;

export class FighterView {
  private readonly visuals: Record<"player" | "target", FighterVisual>;

  constructor(private readonly scene: Phaser.Scene) {
    this.visuals = {
      player: this.createFighterVisual("player", 0x7ee39d, 0x1c8b60, 180, 280, "fighter-player"),
      target: this.createFighterVisual("target", 0xf05f65, 0xb13a48, 760, 280, "fighter-target"),
    };
  }

  render(
    player: FighterState,
    target: FighterState,
    frame: number,
    gameOver: boolean,
    infoHeld: boolean,
    alpha: number,
  ): void {
    this.updateFighter(this.visuals.player, player, frame, gameOver, infoHeld, true, alpha);
    this.updateFighter(this.visuals.target, target, frame, gameOver, infoHeld, false, alpha);
  }

  private createFighterVisual(
    key: "player" | "target",
    bodyTint: number,
    accentTint: number,
    x: number,
    y: number,
    texture: string,
  ): FighterVisual {
    const body = this.scene.add
      .image(x, y, texture)
      .setOrigin(0.5, key === "player" ? TRIANGLE_CENTROID_TEXTURE_Y / 256 : 0.5)
      .setScale(0.42)
      .setTint(bodyTint)
      .setDepth(4);
    const core = this.scene.add.circle(x, y, PLAYER_CORE_RADIUS, 0xff4242, 1).setStrokeStyle(1, 0xffb2b2, 0.9).setDepth(5);
    const ring = this.scene.add.circle(x, y, 12, 0xffffff, 0).setStrokeStyle(2, accentTint, 0.8).setDepth(5);
    const statusTag = this.scene.add.text(x, y - 48, "", {
      fontFamily: "Arial, 'Microsoft YaHei', sans-serif",
      fontSize: "14px",
      color: "#f6f1e6",
    }).setOrigin(0.5).setDepth(6);
    return { body, core, ring, statusTag };
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
    const visible = isPlayer ? !gameOver : fighter.deadUntil === 0;
    const x = lerp(fighter.previousX, fighter.x, alpha);
    const y = lerp(fighter.previousY, fighter.y, alpha);
    visual.body.setPosition(x, y);
    visual.body.setRotation(lerpAngle(fighter.previousFacing, fighter.facing, alpha) + Math.PI / 2);
    visual.body.setVisible(visible);
    visual.body.setTint(isPlayer ? 0x7ee39d : 0xf05f65);
    const blinkAlpha = fighter.invulnerableUntil > 0 && Math.floor(frame / 5) % 2 === 0 ? 0.28 : 1;
    visual.body.setAlpha(visible ? blinkAlpha : 0);
    visual.core.setPosition(x, y);
    visual.ring.setPosition(x, y);
    visual.core.setVisible(visible);
    visual.ring.setVisible(visible);
    visual.statusTag.setPosition(x, y - 48);
    visual.statusTag.setText(fighter.deadUntil > 0 ? "重整中" : `命数 ${Math.max(0, fighter.lives)}  bomb ${fighter.bombs}`);
    visual.statusTag.setAlpha(fighter.statusVisibleUntil > frame || fighter.deadUntil > 0 ? (infoHeld ? 1 : 0.9) : 0);
    visual.core.setFillStyle(0xff4242, fighter.flashUntil > frame ? 0.22 : 1);
  }
}

function lerp(from: number, to: number, alpha: number): number {
  return from + (to - from) * alpha;
}

function lerpAngle(from: number, to: number, alpha: number): number {
  const delta = Math.atan2(Math.sin(to - from), Math.cos(to - from));
  return from + delta * alpha;
}
