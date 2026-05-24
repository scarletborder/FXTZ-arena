import Phaser from "phaser";

import type { BattleInputState, BattleOutputState, BodyDebugData, FighterKey } from "@repo/raid-logic";
import { CrosshairView } from "./crosshair";
import { EffectsView } from "./effects";
import { FighterView } from "./fighter";
import { MobView } from "./mobs";
import { PointView } from "./points";
import { ProjectileView } from "./projectiles";
import { createBattleStage, type BattleViewMode } from "./stage";
import { createBattleTextures } from "./textures";

export class BattleView {
  private readonly fighters: FighterView;
  private readonly crosshair: CrosshairView;
  private readonly projectiles: ProjectileView;
  private readonly effects: EffectsView;
  private readonly mobs: MobView;
  private readonly points: PointView;
  private readonly debugGraphics: Phaser.GameObjects.Graphics;
  private debugPhysicsEnabled = false;

  constructor(scene: Phaser.Scene, mode: BattleViewMode = "training") {
    createBattleTextures(scene);
    createBattleStage(scene, mode);
    this.fighters = new FighterView(scene);
    this.mobs = new MobView(scene);
    this.points = new PointView(scene);
    this.crosshair = new CrosshairView(scene);
    this.projectiles = new ProjectileView(scene);
    this.effects = new EffectsView(scene);
    this.debugGraphics = scene.add.graphics();
    // Use max depth so debug always renders on top of game objects.
    // Other view components use depths in range 2–20, 999 is safely above.
    this.debugGraphics.setDepth(999);
  }

  render(state: BattleOutputState, input: BattleInputState, localFighterKey: FighterKey = "Player1", alpha = 1): void {
    const localFighter = localFighterKey === "Player1" ? state.player : state.target;
    this.fighters.render(state.player, state.target, state.frame, state.gameOver, input.infoHeld, localFighterKey, alpha);
    this.mobs.render(state.neutralMobs, alpha);
    this.points.render({ points: state.points, player: state.player, target: state.target, alpha });
    this.projectiles.render(state.projectiles, state.frame, localFighterKey, alpha);
    this.effects.render(state.effects, state.shields);
    this.crosshair.render({
      pointerX: input.aimX,
      pointerY: input.aimY,
      danger: localFighter.ammo <= 0 || localFighter.reloadRemaining > 0,
      ammoDisplay: localFighter.ammoDisplay,
      ammoCount: localFighter.ammo,
      ammoMax: localFighter.ammoCapacity,
      pointCount: localFighter.pointCount,
      bombs: localFighter.bombs,
      lives: localFighter.lives,
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
