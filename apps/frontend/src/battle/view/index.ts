import Phaser from "phaser";

import type { BattleInputState } from "../types";
import type { BattleModel } from "../model";
import type { BodyDebugData } from "@repo/raid-logic";
import { CrosshairView } from "./crosshair";
import { EffectsView } from "./effects";
import { FighterView } from "./fighter";
import { InfoDisplayView } from "./info-display";
import { ProjectileView } from "./projectiles";
import { createBattleStage } from "./stage";
import { createBattleTextures } from "./textures";

export class BattleView {
  private readonly fighters: FighterView;
  private readonly crosshair: CrosshairView;
  private readonly projectiles: ProjectileView;
  private readonly effects: EffectsView;
  private readonly infoDisplay: InfoDisplayView;
  private readonly debugGraphics: Phaser.GameObjects.Graphics;
  private debugPhysicsEnabled = false;

  constructor(scene: Phaser.Scene) {
    createBattleTextures(scene);
    createBattleStage(scene);
    this.fighters = new FighterView(scene);
    this.crosshair = new CrosshairView(scene);
    this.projectiles = new ProjectileView(scene);
    this.effects = new EffectsView(scene);
    this.infoDisplay = new InfoDisplayView(scene);
    this.debugGraphics = scene.add.graphics();
    // Use max depth so debug always renders on top of game objects.
    // Other view components use depths in range 2–20, 999 is safely above.
    this.debugGraphics.setDepth(999);
  }

  render(model: BattleModel, input: BattleInputState, alpha = 1): void {
    this.fighters.render(model.player, model.target, model.frame, model.gameOver, input.infoHeld, alpha);
    this.projectiles.render(model.projectiles, model.frame, alpha);
    this.effects.render(model.effects);
    this.infoDisplay.render(model);
    this.crosshair.render({
      pointerX: input.aimX,
      pointerY: input.aimY,
      danger: model.player.ammo <= 0 || model.player.reloadRemaining > 0,
      ammoDisplay: model.player.ammoDisplay,
      ammoCount: model.player.ammo,
      ammoMax: model.player.ammoCapacity,
      bombs: model.player.bombs,
    });
  }

  /** Toggle debug rendering of collision bodies. */
  setDebugPhysics(enabled: boolean): void {
    this.debugPhysicsEnabled = enabled;
    this.debugGraphics.setVisible(enabled);
  }

  isDebugPhysics(): boolean {
    return this.debugPhysicsEnabled;
  }

  /**
   * Draw filled collision bodies in bright red.
   */
  renderDebug(data: readonly BodyDebugData[]): void {
    if (!this.debugPhysicsEnabled) return;
    this.debugGraphics.clear();

    for (const body of data) {
      this.debugGraphics.fillStyle(0xff0000, 0.35);
      this.debugGraphics.lineStyle(2, 0xff0000, 1);

      if (body.shape === "ball") {
        this.debugGraphics.fillCircle(body.x, body.y, body.halfWidth);
        this.debugGraphics.strokeCircle(body.x, body.y, body.halfWidth);
      } else {
        this.debugGraphics.save();
        this.debugGraphics.translateCanvas(body.x, body.y);
        this.debugGraphics.rotateCanvas(body.angleRad);
        this.debugGraphics.fillRect(
          -body.halfWidth,
          -body.halfHeight,
          body.halfWidth * 2,
          body.halfHeight * 2,
        );
        this.debugGraphics.strokeRect(
          -body.halfWidth,
          -body.halfHeight,
          body.halfWidth * 2,
          body.halfHeight * 2,
        );
        this.debugGraphics.restore();
      }
    }
  }
}
