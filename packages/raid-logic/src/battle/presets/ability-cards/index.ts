import type { AbilityCardDefinition } from "@repo/content";
import { DEFAULT_BOMBS } from "@repo/types";

import type { FighterState } from "../../types";
import type { BattleAbilityCard, HitResolution } from "./base";
import { BackdoorBattleCard } from "./backdoor";
import { EmberBattleCard } from "./ember";
import { ExtraLifeBattleCard } from "./extra-life";
import { MultiShotBattleCard } from "./multi-shot";
import { SpiritStrikeBattleCard } from "./spirit-strike-card";

export function createBattleAbilityCard(definition: AbilityCardDefinition): BattleAbilityCard {
  switch (definition.id) {
    case "extra_life":
      return new ExtraLifeBattleCard();
    case "ember":
      return new EmberBattleCard();
    case "backdoor":
      return new BackdoorBattleCard();
    case "multi_shot":
      return new MultiShotBattleCard();
    case "spirit_strike_card":
      return new SpiritStrikeBattleCard();
    default:
      throw new Error(`Unknown ability card: ${definition.id}`);
  }
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
