import {
  DEFAULT_ARENA_BOUNDS,
  PLAYER_CORE_RADIUS,
  YOUMU_BOMB_DASH_DISTANCE,
  type ArenaBounds,
} from "@repo/constants";
import type { BattleInputState, BattleOutputState } from "@repo/types";
import type { CollaborateShopItemState } from "@repo/types";

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
  readonly shop: BattleShopPresentationModel;
  readonly transition: BattleTransitionPresentationModel;
  readonly primaryCrosshair: BattleCrosshairViewModel;
  readonly secondaryCrosshair?: BattleCrosshairViewModel;
}

export interface BattleShopPresentationModel {
  readonly visible: boolean;
  readonly open: boolean;
  readonly displayIndex: number;
  readonly localFighterKey: BattleViewFighterKey;
  readonly goods: readonly CollaborateShopItemState[];
  readonly purchasedItemIds: readonly string[];
  readonly readyByFighter: Readonly<Record<BattleViewFighterKey, boolean>>;
  readonly localReady: boolean;
  readonly localRevived: boolean;
  readonly localDead: boolean;
  readonly localMoney: number;
  readonly player1Money: number;
  readonly player2Money: number;
  readonly activeCards: BattleOutputState["player"]["abilityCards"];
  readonly activeCardId: string | undefined;
}

export interface BattleTransitionPresentationModel {
  readonly visible: boolean;
  readonly target: "elite" | "boss" | "shop" | null;
  readonly readyCount: number;
  readonly localReady: boolean;
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
    shop: createShopPresentationModel(
      params.state,
      params.localFighterKey,
      localFighter,
    ),
    transition: createTransitionPresentationModel(
      params.state,
      params.localFighterKey,
    ),
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

function createShopPresentationModel(
  state: BattleOutputState,
  localFighterKey: BattleViewFighterKey,
  localFighter: BattleOutputState["player"],
): BattleShopPresentationModel {
  const extra = state.collaborateExtra;
  const shop = extra?.shop;
  const visible =
    shop?.open === true ||
    (extra?.state === "transition_sync" &&
      extra.pendingTransitionTarget === "shop");
  return {
    visible,
    open: shop?.open === true,
    displayIndex: (shop?.shopIndex ?? 0) + (shop?.open ? 0 : 1),
    localFighterKey,
    goods: shop?.goodsByPlayerId[localFighterKey] ?? shop?.goods ?? [],
    purchasedItemIds: shop?.purchasesByPlayerId[localFighterKey] ?? [],
    readyByFighter: {
      Player1: shop?.readyByPlayerId.Player1 ?? false,
      Player2: shop?.readyByPlayerId.Player2 ?? false,
    },
    localReady: shop?.readyByPlayerId[localFighterKey] ?? false,
    localRevived: shop?.revivedByPlayerId[localFighterKey] ?? false,
    localDead: localFighter.deadUntil > 0,
    localMoney: extra?.moneyByPlayerId[localFighterKey] ?? 0,
    player1Money: extra?.moneyByPlayerId.Player1 ?? 0,
    player2Money: extra?.moneyByPlayerId.Player2 ?? 0,
    activeCards: localFighter.abilityCards.filter(
      (card) => card.kind === "active",
    ),
    activeCardId: localFighter.activeCard?.id,
  };
}

function createTransitionPresentationModel(
  state: BattleOutputState,
  localFighterKey: BattleViewFighterKey,
): BattleTransitionPresentationModel {
  const extra = state.collaborateExtra;
  const visible =
    extra?.state === "transition_sync" && extra.transitionType === "manual";
  const player1Ready = extra?.player1TransitionReady ?? false;
  const player2Ready = extra?.player2TransitionReady ?? false;
  return {
    visible,
    target: visible ? (extra?.pendingTransitionTarget ?? null) : null,
    readyCount: Number(player1Ready) + Number(player2Ready),
    localReady: localFighterKey === "Player1" ? player1Ready : player2Ready,
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
