import type {
  NeutralMobSpellCardDefinitionState,
  NeutralMobSpellCardState,
} from "@repo/types";

export interface SpellCardDefinition {
  readonly id: string;
  readonly displayName: string;
  readonly maxHealth: number;
  readonly durationTicks: number;
}

export interface SpellCardPlan {
  readonly nonSpellMaxHealth: number;
  readonly nonSpellThresholdHealth: number;
  readonly spellCards: readonly SpellCardDefinition[];
}

export function createSpellCardState(
  plan: SpellCardPlan,
): NeutralMobSpellCardState {
  return createNonSpellState(plan, 0);
}

export function applySpellCardDamage(
  state: NeutralMobSpellCardState,
  damage: number,
): { readonly state: NeutralMobSpellCardState; readonly defeated: boolean } {
  if (damage <= 0) {
    return { state, defeated: false };
  }
  const currentHealth = Math.max(0, state.currentHealth - damage);
  const damaged = { ...state, currentHealth };

  if (damaged.phase === "non_spell") {
    if (currentHealth <= damaged.nonSpellThresholdHealth) {
      return { state: createSpellState(damaged), defeated: false };
    }
    return { state: damaged, defeated: false };
  }

  if (currentHealth <= 0) {
    return advanceAfterSpell(damaged);
  }
  return { state: damaged, defeated: false };
}

export function tickSpellCardState(state: NeutralMobSpellCardState): {
  readonly state: NeutralMobSpellCardState;
  readonly defeated: boolean;
} {
  if (state.phase !== "spell_card") {
    return { state, defeated: false };
  }
  const remainingTicks = Math.max(0, state.remainingTicks - 1);
  const ticked = { ...state, remainingTicks };
  if (remainingTicks <= 0) {
    return advanceAfterSpell(ticked);
  }
  return { state: ticked, defeated: false };
}

function createNonSpellState(
  plan: SpellCardPlan,
  spellCardIndex: number,
): NeutralMobSpellCardState {
  return {
    phase: "non_spell",
    spellCardIndex,
    totalSpellCards: plan.spellCards.length,
    remainingSpellCards: Math.max(0, plan.spellCards.length - spellCardIndex),
    currentHealth: plan.nonSpellMaxHealth,
    maxHealth: plan.nonSpellMaxHealth,
    nonSpellMaxHealth: plan.nonSpellMaxHealth,
    nonSpellThresholdHealth: plan.nonSpellThresholdHealth,
    remainingTicks: 0,
    spellCards: plan.spellCards.map(toStateDefinition),
  };
}

function createSpellState(
  state: NeutralMobSpellCardState,
): NeutralMobSpellCardState {
  const spellCard = state.spellCards[state.spellCardIndex];
  if (!spellCard) {
    return { ...state, currentHealth: 0 };
  }
  return {
    ...state,
    phase: "spell_card",
    remainingSpellCards: Math.max(
      0,
      state.totalSpellCards - state.spellCardIndex - 1,
    ),
    currentHealth: spellCard.maxHealth,
    maxHealth: spellCard.maxHealth,
    nonSpellMaxHealth: state.nonSpellMaxHealth,
    remainingTicks: spellCard.durationTicks,
    activeSpellCardName: spellCard.displayName,
  };
}

function advanceAfterSpell(state: NeutralMobSpellCardState): {
  readonly state: NeutralMobSpellCardState;
  readonly defeated: boolean;
} {
  const nextIndex = state.spellCardIndex + 1;
  if (nextIndex >= state.totalSpellCards) {
    return { state: { ...state, currentHealth: 0 }, defeated: true };
  }
  const next = createNonSpellState(
    {
      nonSpellMaxHealth: state.nonSpellMaxHealth,
      nonSpellThresholdHealth: state.nonSpellThresholdHealth,
      spellCards: state.spellCards,
    },
    nextIndex,
  );
  return { state: next, defeated: false };
}

function toStateDefinition(
  definition: SpellCardDefinition,
): NeutralMobSpellCardDefinitionState {
  return { ...definition };
}
