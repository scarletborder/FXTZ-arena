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
  options: {
    readonly storyMode?: boolean;
    readonly lives?: number;
    readonly bombs?: number;
  } = {},
): void {
  if (options.storyMode) {
    fighter.lives = Math.max(0, Math.trunc(options.lives ?? fighter.lives));
    fighter.bombs = Math.max(0, Math.trunc(options.bombs ?? fighter.bombs));
  }
  const resolution: HitResolution = { defaultBombs: options.storyMode ? fighter.bombs : DEFAULT_BOMBS };
  for (const card of cards) {
    if (options.storyMode && card.storyModeOverride?.onInitialize) {
      card.storyModeOverride.onInitialize({ self: fighter, resolution });
    } else {
      card.onInitialize({ self: fighter, resolution });
    }
  }
  fighter.bombs = resolution.defaultBombs;
}
