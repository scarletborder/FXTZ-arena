import {
  DEFAULT_ARENA_BOUNDS,
  PLAYER_CORE_RADIUS,
  YOUMU_BOMB_DASH_DISTANCE,
  type ArenaBounds,
} from "@repo/constants";
import type { BattleInputState, BattleOutputState } from "@repo/raid-logic";

import type { BattleViewFighterKey } from "./types";

export interface BattleCrosshairViewModel {
  readonly pointerX: number;
  readonly pointerY: number;
  readonly danger: boolean;
  readonly highlight: boolean;
  readonly ammoDisplay: number;
  readonly ammoCount: number;
  readonly ammoMax: number;
  readonly pointCount: number;
  readonly bombs: number;
  readonly lives: number;
  readonly activeCardUses: number;
  readonly activeCardUseLimit: number | "infinite" | undefined;
  readonly activeCardCooldownRemaining: number;
  readonly activeCardCooldownTotal: number;
}

export interface BattleViewModel {
  readonly frame: number;
  readonly gameOver: boolean;
  readonly player: BattleOutputState["player"];
  readonly target: BattleOutputState["target"];
  readonly localFighter: BattleOutputState["player"];
  readonly neutralMobs: BattleOutputState["neutralMobs"];
  readonly collaborateExtra: BattleOutputState["collaborateExtra"];
  readonly points: BattleOutputState["points"];
  readonly projectiles: BattleOutputState["projectiles"];
  readonly effects: BattleOutputState["effects"];
  readonly shields: BattleOutputState["shields"];
  readonly localFighterKey: BattleViewFighterKey;
  readonly infoHeld: boolean;
  readonly alpha: number;
  readonly rollbackBlend: number;
  readonly primaryCrosshair: BattleCrosshairViewModel;
  readonly secondaryCrosshair?: BattleCrosshairViewModel;
}

export function createBattleViewModel(params: {
  readonly state: BattleOutputState;
  readonly input: BattleInputState;
  readonly localFighterKey: BattleViewFighterKey;
  readonly arenaBounds?: ArenaBounds;
  readonly alpha?: number;
  readonly rollbackBlend?: number;
  readonly secondaryInput?: BattleInputState;
}): BattleViewModel {
  const localFighter =
    params.localFighterKey === "Player1"
      ? params.state.player
      : params.state.target;
  const arenaBounds = params.arenaBounds ?? DEFAULT_ARENA_BOUNDS;
  return {
    frame: params.state.frame,
    gameOver: params.state.gameOver,
    player: params.state.player,
    target: params.state.target,
    localFighter,
    neutralMobs: params.state.neutralMobs,
    collaborateExtra: params.state.collaborateExtra,
    points: params.state.points,
    projectiles: params.state.projectiles,
    effects: params.state.effects,
    shields: params.state.shields,
    localFighterKey: params.localFighterKey,
    infoHeld: params.input.infoHeld,
    alpha: params.alpha ?? 1,
    rollbackBlend: params.rollbackBlend ?? 1,
    primaryCrosshair: createCrosshairViewModel(
      localFighter,
      params.input,
      arenaBounds,
    ),
    secondaryCrosshair: params.secondaryInput
      ? createCrosshairViewModel(
          params.state.target,
          params.secondaryInput,
          arenaBounds,
        )
      : undefined,
  };
}

function createCrosshairViewModel(
  fighter: BattleOutputState["player"],
  input: BattleInputState,
  arenaBounds: ArenaBounds,
): BattleCrosshairViewModel {
  return {
    pointerX: input.aimX,
    pointerY: input.aimY,
    danger: fighter.ammo <= 0 || fighter.reloadRemaining > 0,
    highlight: canYoumuDashToPointer(
      fighter,
      input.aimX,
      input.aimY,
      arenaBounds,
    ),
    ammoDisplay: fighter.ammoDisplay,
    ammoCount: fighter.ammo,
    ammoMax: fighter.ammoCapacity,
    pointCount: fighter.pointCount,
    bombs: fighter.bombs,
    lives: fighter.lives,
    activeCardUses: fighter.activeCardUses,
    activeCardUseLimit: fighter.activeCard?.useLimit,
    activeCardCooldownRemaining: fighter.activeCardCooldownUntil,
    activeCardCooldownTotal: fighter.activeCard?.cooldownTicks ?? 0,
  };
}

function canYoumuDashToPointer(
  fighter: BattleOutputState["player"],
  pointerX: number,
  pointerY: number,
  arenaBounds: ArenaBounds,
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
