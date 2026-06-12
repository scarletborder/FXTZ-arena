import type { PlayerId } from "../core";

export type CollaborateRunState =
  | "running"
  | "transition_sync"
  | "victory"
  | "defeat";

export type CollaborateTransitionTarget = "elite" | "boss" | "shop";
export type CollaborateTransitionType = "auto" | "manual";

export interface CollaborateShopItemState {
  readonly id: string;
  readonly kind: "life" | "bomb" | "point" | "ability_card" | "sold_out";
  readonly price: number;
  readonly abilityCardId?: string;
}

export interface CollaborateShopState {
  readonly open: boolean;
  readonly shopIndex: number;
  readonly rarityPulls: Readonly<Partial<Record<"common" | "rare", number>>>;
  readonly goods: readonly CollaborateShopItemState[];
  readonly goodsByPlayerId: Readonly<Record<PlayerId, readonly CollaborateShopItemState[]>>;
  readonly purchasesByPlayerId: Readonly<Record<PlayerId, readonly string[]>>;
  readonly readyByPlayerId: Readonly<Record<PlayerId, boolean>>;
  readonly revivedByPlayerId: Readonly<Record<PlayerId, boolean>>;
}

export interface CollaborateWaveState {
  readonly waveIndex: number;
  readonly currentWaveId: string | null;
  readonly waveStartFrame: number;
  readonly nextWaveAllowedFrame: number;
  readonly forceNextWaveFrame: number;
}

export interface CollaborateBossSpellState {
  readonly phase: "non_spell" | "spell_card";
  readonly spellCardIndex: number;
  readonly remainingFrame: number;
  readonly spellCardHp: number;
  readonly nonSpellHpProgress: number;
}

export interface CollaborateExtraState {
  readonly state: CollaborateRunState;
  readonly pendingTransitionTarget: CollaborateTransitionTarget | null;
  readonly transitionType: CollaborateTransitionType | null;
  readonly player1TransitionReady: boolean;
  readonly player2TransitionReady: boolean;
  readonly wave: CollaborateWaveState;
  readonly shop: CollaborateShopState;
  readonly moneyByPlayerId: Readonly<Record<PlayerId, number>>;
  readonly scoreByPlayerId: Readonly<Record<PlayerId, number>>;
  readonly bossDefeated: boolean;
  readonly spawnerRngState: string;
  readonly cardDrawSeed: number;
  readonly eliteBossSpell: CollaborateBossSpellState;
}

export function createDefaultCollaborateExtraState(
  frame = 0,
  seed = 1,
): CollaborateExtraState {
  return {
    state: "running",
    pendingTransitionTarget: null,
    transitionType: null,
    player1TransitionReady: false,
    player2TransitionReady: false,
    wave: {
      waveIndex: 0,
      currentWaveId: null,
      waveStartFrame: frame,
      nextWaveAllowedFrame: frame,
      forceNextWaveFrame: frame,
    },
    shop: {
      open: false,
      shopIndex: 0,
      rarityPulls: {},
      goods: [],
      goodsByPlayerId: { Player1: [], Player2: [], Neutral: [] },
      purchasesByPlayerId: { Player1: [], Player2: [], Neutral: [] },
      readyByPlayerId: { Player1: false, Player2: false, Neutral: false },
      revivedByPlayerId: { Player1: false, Player2: false, Neutral: false },
    },
    moneyByPlayerId: { Player1: 0, Player2: 0, Neutral: 0 },
    scoreByPlayerId: { Player1: 0, Player2: 0, Neutral: 0 },
    bossDefeated: false,
    spawnerRngState: String(seed),
    cardDrawSeed: seed,
    eliteBossSpell: {
      phase: "non_spell",
      spellCardIndex: 0,
      remainingFrame: 0,
      spellCardHp: 0,
      nonSpellHpProgress: 0,
    },
  };
}
