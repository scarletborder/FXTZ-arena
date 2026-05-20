import type { AbilityCardDefinition } from "@repo/content";
import { DEFAULT_BOMBS } from "@repo/types";

import { cardLibrary } from "../../registry";
import type { FighterState } from "../../types";
import type { BattleAbilityCard, HitResolution } from "./base";

// Side-effect imports trigger @Vanilla.RegisterCard decorators
import "./extra-life";
import "./ember";
import "./backdoor";
import "./multi-shot";
import "./spirit-strike-card";

export function createBattleAbilityCard(definition: AbilityCardDefinition): BattleAbilityCard {
  return cardLibrary.create(definition.id);
}

export function applyInitialCardState(
  fighter: FighterState,
  cards: readonly BattleAbilityCard[],
): void {
  const resolution: HitResolution = { defaultBombs: DEFAULT_BOMBS };
  for (const card of cards) {
    card.onInitialize({ self: fighter, resolution });
  }
  fighter.bombs = resolution.defaultBombs;
}

export type { BattleAbilityCard } from "./base";
export type {
  BattleCardContext,
  BattleHitContext,
  BattleInitializeContext,
  HitResolution,
} from "./base";
