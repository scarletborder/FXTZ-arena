import Phaser from "phaser";

import {
  ARENA_HEIGHT,
  ARENA_WIDTH,
  PLAYER_CORE_RADIUS,
  YOUMU_BOMB_DASH_DISTANCE,
} from "@repo/constants";
import type {
  BattleInputState,
  BattleOutputState,
  BodyDebugData,
  FighterKey,
} from "@repo/raid-logic";
import type { MapId } from "@repo/types";
import { CrosshairView } from "./crosshair";
import { BattleDebugView } from "./debug";
import { EffectsView } from "./effects";
import { FighterView } from "./fighter";
import { MobView } from "./mobs";
import { PointView } from "./points";
import { ProjectileView } from "./projectile";
import {
  createBattleStage,
  type BattleStage,
  type BattleViewMode,
} from "./stage";
import { createBattleTextures } from "./textures";

export class BattleView {
  private readonly fighters: FighterView;
  private readonly crosshair: CrosshairView;
  private readonly projectiles: ProjectileView;
  private readonly effects: EffectsView;
  private readonly mobs: MobView;
  private readonly points: PointView;
  private readonly stage: BattleStage;
  private readonly debug: BattleDebugView;

  constructor(scene: Phaser.Scene, mode: BattleViewMode = "training", mapId?: MapId) {
    createBattleTextures(scene);
    this.stage = createBattleStage(scene, mode, mapId);
    this.fighters = new FighterView(scene);
    this.mobs = new MobView(scene);
    this.points = new PointView(scene);
    this.crosshair = new CrosshairView(scene);
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
  ): void {
    const localFighter =
      localFighterKey === "Player1" ? state.player : state.target;
    this.stage.render(state.player, state.target);
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
    this.mobs.render(state.neutralMobs, alpha, rollbackBlend);
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
      alpha,
      rollbackBlend,
    );
    this.effects.render(state.effects, state.shields);
    this.crosshair.render({
      pointerX: input.aimX,
      pointerY: input.aimY,
      danger: localFighter.ammo <= 0 || localFighter.reloadRemaining > 0,
      highlight: canYoumuDashToPointer(localFighter, input.aimX, input.aimY),
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
): boolean {
  if (fighter.activeCharacter.id !== "youmu") return false;
  if (
    pointerX < PLAYER_CORE_RADIUS ||
    pointerX > ARENA_WIDTH - PLAYER_CORE_RADIUS ||
    pointerY < PLAYER_CORE_RADIUS ||
    pointerY > ARENA_HEIGHT - PLAYER_CORE_RADIUS
  ) {
    return false;
  }
  return (
    Math.hypot(pointerX - fighter.x, pointerY - fighter.y) <=
    YOUMU_BOMB_DASH_DISTANCE
  );
}
