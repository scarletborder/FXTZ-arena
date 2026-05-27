export * from "./queries";
export * from "./types";

export * from "./card-library";
export * from "./base";
export type {
  BattleCardContext,
  BattleHitContext,
  BattleInitializeContext,
  HitResolution,
} from "./base";

// Side-effect imports trigger @Vanilla.RegisterCard decorators
import "./extra-life";
import "./ember";
import "./backdoor";
import "./multi-shot";
import "./spirit-strike-card";
import "./extension";
import "./graze-lover";

import type { AbilityCardDefinition } from "./types";
import type { FighterState } from "../battle-types";
import { cardLibrary } from "./card-library";
import type { BattleAbilityCard } from "./base";
import type { HitResolution } from "./base";
import { DEFAULT_BOMBS } from "@repo/constants";

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
