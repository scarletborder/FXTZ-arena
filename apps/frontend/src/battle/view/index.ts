import Phaser from "phaser";

import {
  DEFAULT_ARENA_BOUNDS,
  PLAYER_CORE_RADIUS,
  YOUMU_BOMB_DASH_DISTANCE,
  normalizeArenaBounds,
  type ArenaBounds,
} from "@repo/constants";
import { getCombatMapDefinition } from "@repo/content";
import type {
  BattleInputState,
  BattleOutputState,
  BodyDebugData,
  FighterKey,
} from "@repo/raid-logic";
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
import {
  createBattleStage,
  type BattleStage,
  type BattleViewMode,
} from "./stage";
import { createBattleTextures } from "./textures";

export class BattleView {
  private readonly fighters: FighterView;
  private readonly crosshair: CrosshairView;
  private readonly secondaryCrosshair: CrosshairView;
  private readonly projectiles: ProjectileView;
  private readonly effects: EffectsView;
  private readonly mobs: MobView;
  private readonly spellCardHud: SpellCardHud;
  private readonly collaborateHud: CollaborateHud;
  private readonly points: PointView;
  private readonly stage: BattleStage;
  private readonly debug: BattleDebugView;
  private readonly arenaBounds: ArenaBounds;
  private readonly battleMode: "versus" | "collaborate";

  constructor(
    scene: Phaser.Scene,
    mode: BattleViewMode = "training",
    mapId?: MapId,
    battleMode: "versus" | "collaborate" = "versus",
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
    this.fighters = new FighterView(scene);
    this.mobs = new MobView(scene);
    this.spellCardHud = new SpellCardHud(scene);
    this.collaborateHud = new CollaborateHud(scene);
    this.points = new PointView(scene);
    this.crosshair = new CrosshairView(scene);
    this.secondaryCrosshair = new CrosshairView(scene, "cursor-x");
    this.projectiles = new ProjectileView(scene);
    this.effects = new EffectsView(scene);
    this.debug = new BattleDebugView(scene);
  }

  render(
    state: BattleOutputState,
    input: BattleInputState,
    localFighterKey: FighterKey = "Player1",
    alpha = 1,
    rollbackBlend = 1,
    secondaryInput?: BattleInputState,
  ): void {
    const localFighter =
      localFighterKey === "Player1" ? state.player : state.target;
    this.stage.render(localFighter, state.player, state.target);
    this.fighters.render(
      state.player,
      state.target,
      state.frame,
      state.gameOver,
      input.infoHeld,
      localFighterKey,
      alpha,
      rollbackBlend,
    );
    this.mobs.render(
      state.neutralMobs,
      localFighter,
      state.frame,
      this.arenaBounds,
      alpha,
      rollbackBlend,
    );
    this.spellCardHud.render(state.neutralMobs);
    this.collaborateHud.render(state.collaborateExtra, localFighterKey);
    this.points.render({
      points: state.points,
      player: state.player,
      target: state.target,
      alpha,
      rollbackBlend,
    });
    this.projectiles.render(
      state.projectiles,
      state.frame,
      { player: state.player, target: state.target },
      localFighterKey,
      this.battleMode,
      alpha,
      rollbackBlend,
    );
    this.effects.render(state.effects, state.shields);
    if (state.collaborateExtra?.shop.open) {
      this.crosshair.setVisible(false);
      this.secondaryCrosshair.setVisible(false);
    } else {
      this.crosshair.render({
        pointerX: input.aimX,
        pointerY: input.aimY,
        danger: localFighter.ammo <= 0 || localFighter.reloadRemaining > 0,
        highlight: canYoumuDashToPointer(
          localFighter,
          input.aimX,
          input.aimY,
          this.arenaBounds,
        ),
        ammoDisplay: localFighter.ammoDisplay,
        ammoCount: localFighter.ammo,
        ammoMax: localFighter.ammoCapacity,
        pointCount: localFighter.pointCount,
        bombs: localFighter.bombs,
        lives: localFighter.lives,
        activeCardUses: localFighter.activeCardUses,
        activeCardUseLimit: localFighter.activeCard?.useLimit,
        activeCardCooldownRemaining: localFighter.activeCardCooldownUntil,
        activeCardCooldownTotal: localFighter.activeCard?.cooldownTicks ?? 0,
      });
      if (secondaryInput) {
        const targetFighter = state.target;
        this.secondaryCrosshair.render({
          pointerX: secondaryInput.aimX,
          pointerY: secondaryInput.aimY,
          danger: targetFighter.ammo <= 0 || targetFighter.reloadRemaining > 0,
          highlight: canYoumuDashToPointer(
            targetFighter,
            secondaryInput.aimX,
            secondaryInput.aimY,
            this.arenaBounds,
          ),
          ammoDisplay: targetFighter.ammoDisplay,
          ammoCount: targetFighter.ammo,
          ammoMax: targetFighter.ammoCapacity,
          pointCount: targetFighter.pointCount,
          bombs: targetFighter.bombs,
          lives: targetFighter.lives,
          activeCardUses: targetFighter.activeCardUses,
          activeCardUseLimit: targetFighter.activeCard?.useLimit,
          activeCardCooldownRemaining: targetFighter.activeCardCooldownUntil,
          activeCardCooldownTotal: targetFighter.activeCard?.cooldownTicks ?? 0,
        });
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
}

function canYoumuDashToPointer(
  fighter: BattleOutputState["player"],
  pointerX: number,
  pointerY: number,
  arenaBounds: ArenaBounds = DEFAULT_ARENA_BOUNDS,
): boolean {
  if (fighter.activeCharacter.id !== "youmu") return false;
  if (
    pointerX < PLAYER_CORE_RADIUS ||
    pointerX > arenaBounds.width - PLAYER_CORE_RADIUS ||
    pointerY < PLAYER_CORE_RADIUS ||
    pointerY > arenaBounds.height - PLAYER_CORE_RADIUS
  ) {
    return false;
  }
  return (
    Math.hypot(pointerX - fighter.x, pointerY - fighter.y) <=
    YOUMU_BOMB_DASH_DISTANCE
  );
}
