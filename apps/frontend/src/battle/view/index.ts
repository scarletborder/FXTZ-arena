import Phaser from "phaser";

import {
  DEFAULT_ARENA_BOUNDS,
  normalizeArenaBounds,
  type ArenaBounds,
} from "@repo/constants";
import { getCombatMapDefinition } from "@repo/content";
import type { BodyDebugData } from "@repo/raid-logic";
import type { MapId } from "@repo/types";
import { CrosshairView } from "./crosshair";
import { CollaborateHud } from "./collaborate-hud";
import { BattleDebugView } from "./debug";
import { EffectsView } from "./effects";
import { FighterView } from "./fighter";
import { MobView } from "./mobs";
import { PointView } from "./points";
import { ProjectileView } from "./projectile";
import { SpellCardHud } from "./spell-card-hud";
import { WingmanView } from "../sfx/wingman";
import {
  createBattleStage,
  type BattleStage,
  type BattleViewMode,
} from "./stage";
import { createBattleTextures } from "./textures";
import type { ProjectileAlphaOptions } from "./projectile/display";
import type { BattleViewModel } from "./model";

export class BattleView {
  private readonly fighters: FighterView;
  private readonly crosshair: CrosshairView;
  private readonly secondaryCrosshair: CrosshairView;
  private readonly projectiles: ProjectileView;
  private readonly wingmen: WingmanView;
  private readonly effects: EffectsView;
  private readonly mobs: MobView;
  private readonly spellCardHud: SpellCardHud;
  private readonly collaborateHud: CollaborateHud;
  private readonly points: PointView;
  private readonly stage: BattleStage;
  private readonly debug: BattleDebugView;
  private readonly arenaBounds: ArenaBounds;
  private readonly battleMode: "versus" | "collaborate";
  private readonly projectileAlphaOptions: ProjectileAlphaOptions;

  constructor(
    scene: Phaser.Scene,
    mode: BattleViewMode = "training",
    mapId?: MapId,
    battleMode: "versus" | "collaborate" = "versus",
    projectileAlphaOptions: ProjectileAlphaOptions = {},
  ) {
    createBattleTextures(scene);
    const map = getCombatMapDefinition(mapId ?? "hakurei_shrine");
    this.arenaBounds = map
      ? normalizeArenaBounds({
          width: map.width,
          height: map.height,
          viewportWidth: map.viewportWidth,
          viewportHeight: map.viewportHeight,
        })
      : DEFAULT_ARENA_BOUNDS;
    this.stage = createBattleStage(scene, mode, mapId);
    this.battleMode = battleMode;
    this.projectileAlphaOptions = projectileAlphaOptions;
    this.fighters = new FighterView(scene);
    this.mobs = new MobView(scene);
    this.spellCardHud = new SpellCardHud(scene);
    this.collaborateHud = new CollaborateHud(scene);
    this.points = new PointView(scene);
    this.crosshair = new CrosshairView(scene);
    this.secondaryCrosshair = new CrosshairView(scene, "cursor-x");
    this.projectiles = new ProjectileView(scene);
    this.wingmen = new WingmanView(scene);
    this.effects = new EffectsView(scene);
    this.debug = new BattleDebugView(scene);
  }

  render(model: BattleViewModel): void {
    this.stage.render(model.localFighter, model.player, model.target);
    this.fighters.render(
      model.player,
      model.target,
      model.frame,
      model.gameOver,
      model.infoHeld,
      model.localFighterKey,
      model.primaryCrosshair.pointerX,
      model.primaryCrosshair.pointerY,
      model.alpha,
      model.rollbackBlend,
    );
    this.mobs.render(
      model.neutralMobs,
      model.localFighter,
      model.frame,
      this.arenaBounds,
      model.alpha,
      model.rollbackBlend,
    );
    this.spellCardHud.render(model.neutralMobs);
    this.collaborateHud.render(model.collaborateExtra, model.localFighterKey);
    this.points.render({
      points: model.points,
      player: model.player,
      target: model.target,
      alpha: model.alpha,
      rollbackBlend: model.rollbackBlend,
    });
    this.wingmen.render({
      player: model.player,
      target: model.target,
      frame: model.frame,
      gameOver: model.gameOver,
      localFighterKey: model.localFighterKey,
      alpha: model.alpha,
      rollbackBlend: model.rollbackBlend,
    });
    this.projectiles.render(
      model.projectiles,
      model.frame,
      { player: model.player, target: model.target },
      model.localFighterKey,
      this.battleMode,
      this.projectileAlphaOptions,
      model.alpha,
      model.rollbackBlend,
    );
    this.effects.render(model.effects, model.shields);
    if (model.collaborateExtra?.shop.open) {
      this.crosshair.setVisible(false);
      this.secondaryCrosshair.setVisible(false);
    } else {
      this.crosshair.render(model.primaryCrosshair);
      if (model.secondaryCrosshair) {
        this.secondaryCrosshair.render(model.secondaryCrosshair);
      } else {
        this.secondaryCrosshair.setVisible(false);
      }
    }
  }

  /** Toggle debug rendering of collision bodies. */
  setDebugPhysics(enabled: boolean): void {
    this.debug.setEnabled(enabled);
  }

  isDebugPhysics(): boolean {
    return this.debug.isEnabled();
  }

  renderDebugBodies(data: readonly BodyDebugData[]): void {
    this.debug.renderBodies(data);
  }

  destroy(): void {
    this.fighters.destroy();
  }
}
