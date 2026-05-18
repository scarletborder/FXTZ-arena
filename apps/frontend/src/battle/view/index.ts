import Phaser from "phaser";

import type { BattleInputState } from "../types";
import type { BattleModel } from "../model";
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

  constructor(scene: Phaser.Scene) {
    createBattleTextures(scene);
    createBattleStage(scene);
    this.fighters = new FighterView(scene);
    this.crosshair = new CrosshairView(scene);
    this.projectiles = new ProjectileView(scene);
    this.effects = new EffectsView(scene);
    this.infoDisplay = new InfoDisplayView(scene);
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
}
