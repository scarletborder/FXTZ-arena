import type {
  AbilityCardId,
  BattleInputState,
  CollaborateExtraState,
  CollaborateShopItemState,
} from "@repo/types";
import { getAllAbilityCardDefinitions } from "@repo/content";

import { getAbilityCard } from "../content";
import type { BattleFighter } from "./battle-fighter";
import type { ActiveCardSwitchHandler } from "./controller";
import type { PointManager } from "./manager/point-manager";
import { clampCollaborateCurrency } from "./utils/currency";
import { drawWithoutReplacement, mulberry32 } from "./utils/random";

export const COLLABORATE_TRANSITION_MIN_WAIT_FRAMES = 60;

export function beginCollaborateTransitionState(params: {
  readonly extra: CollaborateExtraState | undefined;
  readonly frame: number;
  readonly target: "elite" | "boss" | "shop";
  readonly type: "auto" | "manual";
}): CollaborateExtraState | undefined {
  if (!params.extra) return params.extra;
  return {
    ...params.extra,
    state: "transition_sync",
    pendingTransitionTarget: params.target,
    transitionType: params.type,
    transitionReadyFrame:
      params.frame + COLLABORATE_TRANSITION_MIN_WAIT_FRAMES,
    player1TransitionReady: false,
    player2TransitionReady: false,
  };
}

export function processCollaborateTransitionSync(params: {
  readonly extra: CollaborateExtraState | undefined;
  readonly frame: number;
  readonly firstInput: BattleInputState;
  readonly secondInput: BattleInputState | undefined;
  readonly firstIsPlayer: boolean;
  readonly seed: number;
  readonly playerFighter: BattleFighter;
  readonly targetFighter: BattleFighter;
}): {
  readonly handled: boolean;
  readonly extra: CollaborateExtraState | undefined;
  readonly shouldClearHazards: boolean;
  readonly openedShop: boolean;
} {
  const extra = params.extra;
  if (!extra || extra.state !== "transition_sync") {
    return {
      handled: false,
      extra,
      shouldClearHazards: false,
      openedShop: false,
    };
  }

  const playerInput = params.firstIsPlayer
    ? params.firstInput
    : params.secondInput;
  const targetInput = params.firstIsPlayer
    ? params.secondInput
    : params.firstInput;
  const player1Ready = Boolean(
    playerInput?.transitionReadyPressed || extra.player1TransitionReady,
  );
  const player2Ready = Boolean(
    targetInput?.transitionReadyPressed || extra.player2TransitionReady,
  );
  if (
    !player1Ready ||
    !player2Ready ||
    params.frame < extra.transitionReadyFrame
  ) {
    return {
      handled: true,
      extra: {
        ...extra,
        player1TransitionReady: player1Ready,
        player2TransitionReady: player2Ready,
      },
      shouldClearHazards: false,
      openedShop: false,
    };
  }

  const opensShop = extra.pendingTransitionTarget === "shop";
  const shopIndex = extra.shop.shopIndex + 1;
  const goodsByPlayerId = opensShop
    ? createCollaborateShopGoodsByPlayer({
        seed: params.seed,
        shopIndex,
        rarityPulls: extra.shop.rarityPulls,
        playerFighter: params.playerFighter,
        targetFighter: params.targetFighter,
      })
    : extra.shop.goodsByPlayerId;

  return {
    handled: false,
    shouldClearHazards: true,
    openedShop: opensShop,
    extra: {
      ...extra,
      state: "running",
      pendingTransitionTarget: null,
      transitionType: null,
      transitionReadyFrame: params.frame,
      player1TransitionReady: false,
      player2TransitionReady: false,
      shop: opensShop
        ? {
            ...extra.shop,
            open: true,
            shopIndex,
            goods: goodsByPlayerId.Player1,
            goodsByPlayerId,
            readyByPlayerId: {
              Player1: false,
              Player2: false,
              Neutral: false,
            },
            revivedByPlayerId: {
              Player1: false,
              Player2: false,
              Neutral: false,
            },
          }
        : extra.shop,
    },
  };
}

export function drawCollaborateShopCards(
  seed: number,
  shopIndex: number,
  rarityPulls: Readonly<Partial<Record<"common" | "rare", number>>>,
  ownedAbilityCardIds: readonly string[],
  cards: readonly {
    readonly id: string;
    readonly collaborateShop?: { readonly rarity: "common" | "rare" | "disabled" };
  }[],
): readonly (
  | { readonly kind: "ability_card"; readonly id: string }
  | { readonly kind: "sold_out"; readonly slot: number }
)[] {
  const owned = new Set(ownedAbilityCardIds);
  const available = cards.filter(
    (card) =>
      (card.collaborateShop?.rarity ?? "common") !== "disabled" &&
      !owned.has(card.id),
  );
  const common = available.filter(
    (card) => (card.collaborateShop?.rarity ?? "common") === "common",
  );
  const rare = available.filter(
    (card) => card.collaborateShop?.rarity === "rare",
  );
  const rng = mulberry32((seed ^ (shopIndex * 0x9e3779b9)) >>> 0);
  const picked: Array<
    | { readonly kind: "ability_card"; readonly id: string }
    | { readonly kind: "sold_out"; readonly slot: number }
  > = [];
  for (const card of drawWithoutReplacement(
    common,
    rarityPulls.common ?? 0,
    rng,
  )) {
    picked.push({ kind: "ability_card", id: card.id });
  }
  while (picked.length < (rarityPulls.common ?? 0)) {
    picked.push({ kind: "sold_out", slot: picked.length });
  }
  const rareStart = picked.length;
  for (const card of drawWithoutReplacement(rare, rarityPulls.rare ?? 0, rng)) {
    picked.push({ kind: "ability_card", id: card.id });
  }
  while (picked.length < rareStart + (rarityPulls.rare ?? 0)) {
    picked.push({ kind: "sold_out", slot: picked.length });
  }
  return picked.slice(0, 4);
}

export function createCollaborateShopGoods(params: {
  readonly seed: number;
  readonly shopIndex: number;
  readonly rarityPulls: Readonly<Partial<Record<"common" | "rare", number>>> | undefined;
  readonly ownedAbilityCardIds: readonly string[];
  readonly ownerKey: "Player1" | "Player2";
}): readonly CollaborateShopItemState[] {
  const baseGoods: CollaborateShopItemState[] = [
    { id: `shop-${params.shopIndex}:life`, kind: "life", price: 46 },
    { id: `shop-${params.shopIndex}:bomb`, kind: "bomb", price: 46 },
    { id: `shop-${params.shopIndex}:point`, kind: "point", price: 46 },
  ];
  const cardGoods = drawCollaborateShopCards(
    params.seed,
    params.shopIndex,
    params.rarityPulls ?? { common: 4 },
    params.ownedAbilityCardIds,
    getAllAbilityCardDefinitions(),
  ).map((card) => ({
    id:
      card.kind === "sold_out"
        ? `shop-${params.shopIndex}:${params.ownerKey}:sold-out:${card.slot}`
        : `shop-${params.shopIndex}:${params.ownerKey}:card:${card.id}`,
    kind: card.kind,
    price: 46,
    abilityCardId:
      card.kind === "ability_card" ? (card.id as AbilityCardId) : undefined,
  }));
  return [...baseGoods, ...cardGoods];
}

export function createCollaborateShopGoodsByPlayer(params: {
  readonly seed: number;
  readonly shopIndex: number;
  readonly rarityPulls:
    | Readonly<Partial<Record<"common" | "rare", number>>>
    | undefined;
  readonly playerFighter: BattleFighter;
  readonly targetFighter: BattleFighter;
}): Readonly<
  Record<"Player1" | "Player2" | "Neutral", readonly CollaborateShopItemState[]>
> {
  return {
    Player1: createCollaborateShopGoods({
      seed: params.seed,
      shopIndex: params.shopIndex,
      rarityPulls: params.rarityPulls,
      ownedAbilityCardIds: params.playerFighter.state.abilityCards.map(
        (card) => card.id,
      ),
      ownerKey: "Player1",
    }),
    Player2: createCollaborateShopGoods({
      seed: params.seed,
      shopIndex: params.shopIndex,
      rarityPulls: params.rarityPulls,
      ownedAbilityCardIds: params.targetFighter.state.abilityCards.map(
        (card) => card.id,
      ),
      ownerKey: "Player2",
    }),
    Neutral: [],
  };
}

export function resetCollaborateShopActiveCards(params: {
  readonly frame: number;
  readonly playerFighter: BattleFighter;
  readonly targetFighter: BattleFighter;
  registerActiveCardUse(fighter: BattleFighter): void;
}): void {
  params.playerFighter.resetActiveCardUsage();
  params.targetFighter.resetActiveCardUsage();
  params.registerActiveCardUse(params.playerFighter);
  params.registerActiveCardUse(params.targetFighter);
}

export function processCollaborateShopInputs(params: {
  readonly extra: CollaborateExtraState | undefined;
  readonly firstInput: BattleInputState;
  readonly secondInput: BattleInputState | undefined;
  readonly firstIsPlayer: boolean;
  readonly playerFighter: BattleFighter;
  readonly targetFighter: BattleFighter;
  readonly pointManager: PointManager;
  readonly frame: number;
  processActiveCardSwitch: ActiveCardSwitchHandler;
  isFighterDefeated(fighter: BattleFighter): boolean;
  registerActiveCardUse(fighter: BattleFighter): void;
}): CollaborateExtraState | undefined {
  const extra = params.extra;
  if (!extra?.shop.open) return extra;

  const playerInput = params.firstIsPlayer
    ? params.firstInput
    : params.secondInput;
  const targetInput = params.firstIsPlayer
    ? params.secondInput
    : params.firstInput;
  let next = extra;
  next = applyCollaborateShopInput(next, "Player1", playerInput, params);
  next = applyCollaborateShopInput(next, "Player2", targetInput, params);
  return next;
}

export function recoverDeadCollaborateShopPlayers(params: {
  readonly extra: CollaborateExtraState | undefined;
  readonly playerFighter: BattleFighter;
  readonly targetFighter: BattleFighter;
  isFighterDefeated(fighter: BattleFighter): boolean;
}): CollaborateExtraState | undefined {
  if (!params.extra) return params.extra;
  let extra = params.extra;
  for (const [key, fighter] of [
    ["Player1", params.playerFighter],
    ["Player2", params.targetFighter],
  ] as const) {
    if (!params.isFighterDefeated(fighter)) continue;
    const partner =
      key === "Player1"
        ? params.targetFighter.state
        : params.playerFighter.state;
    fighter.state.lives = 1;
    fighter.state.x = partner.x;
    fighter.state.y = partner.y;
    fighter.state.previousX = partner.x;
    fighter.state.previousY = partner.y;
    fighter.state.deadUntil = 0;
    fighter.state.actionLockedUntil = 0;
    fighter.state.nonFireActionLockedUntil = 0;
    fighter.state.movementLockedUntil = 0;
    fighter.state.switchLockedUntil = 0;
    extra = {
      ...extra,
      shop: {
        ...extra.shop,
        revivedByPlayerId: {
          ...extra.shop.revivedByPlayerId,
          [key]: true,
        },
      },
    };
  }
  return extra;
}

function applyCollaborateShopInput(
  extra: CollaborateExtraState,
  key: "Player1" | "Player2",
  input: BattleInputState | undefined,
  params: Parameters<typeof processCollaborateShopInputs>[0],
): CollaborateExtraState {
  let next = extra;
  const fighter = key === "Player1" ? params.playerFighter : params.targetFighter;
  params.processActiveCardSwitch(fighter, input?.activeCardSwitchId);
  if (input?.shopPurchaseItemId) {
    next = tryPurchaseCollaborateShopItem(next, key, input.shopPurchaseItemId, {
      ...params,
      fighter,
    });
  }
  if (!input?.shopReadyPressed) {
    return next;
  }
  return {
    ...next,
    shop: {
      ...next.shop,
      readyByPlayerId: {
        ...next.shop.readyByPlayerId,
        [key]: true,
      },
    },
  };
}

function tryPurchaseCollaborateShopItem(
  extra: CollaborateExtraState,
  key: "Player1" | "Player2",
  itemId: string,
  params: Parameters<typeof processCollaborateShopInputs>[0] & {
    readonly fighter: BattleFighter;
  },
): CollaborateExtraState {
  if (extra.shop.readyByPlayerId[key]) return extra;
  if (extra.shop.revivedByPlayerId[key]) return extra;
  if (params.isFighterDefeated(params.fighter)) return extra;

  const item = extra.shop.goodsByPlayerId[key].find(
    (candidate) => candidate.id === itemId,
  );
  if (!item) return extra;
  if (item.kind === "sold_out") return extra;
  if (extra.shop.purchasesByPlayerId[key].includes(item.id)) return extra;

  const money = extra.moneyByPlayerId[key];
  if (money < item.price) return extra;

  applyCollaborateShopItem(params.fighter, item, params);
  return {
    ...extra,
    moneyByPlayerId: {
      ...extra.moneyByPlayerId,
      [key]: clampCollaborateCurrency(money - item.price),
    },
    shop: {
      ...extra.shop,
      purchasesByPlayerId: {
        ...extra.shop.purchasesByPlayerId,
        [key]: [...extra.shop.purchasesByPlayerId[key], item.id],
      },
    },
  };
}

function applyCollaborateShopItem(
  fighter: BattleFighter,
  item: CollaborateShopItemState,
  params: Parameters<typeof processCollaborateShopInputs>[0],
): void {
  switch (item.kind) {
    case "life":
      fighter.state.lives += 1;
      return;
    case "bomb":
      fighter.state.bombs += 1;
      return;
    case "point":
      params.pointManager.setPointCount(
        fighter.state,
        fighter.state.pointCount + 80,
      );
      return;
    case "ability_card":
      if (item.abilityCardId) {
        const card = getAbilityCard(item.abilityCardId as AbilityCardId);
        fighter.acquireAbilityCard(card);
        if (card.kind === "active") {
          fighter.setActiveAbilityCard(card);
          params.registerActiveCardUse(fighter);
        }
      }
      return;
  }
}
