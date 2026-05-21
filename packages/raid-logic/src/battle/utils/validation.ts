import { getAbilityCardDefinition, getCharacterDefinition } from "@repo/content";
import { DEFAULT_COST_LIMIT, type BattleMode, type PlayerLoadout } from "@repo/types";

export interface LoadoutValidationOptions {
  readonly mode?: BattleMode;
  readonly costLimit?: number;
}

export interface LoadoutValidationResult {
  readonly valid: boolean;
  readonly totalCost: number;
  readonly errors: readonly LoadoutValidationError[];
}

export type LoadoutValidationError =
  | "primary_character_missing"
  | "alternate_character_missing"
  | "duplicate_characters"
  | "ability_card_missing"
  | "too_many_active_cards"
  | "active_card_id_required"
  | "active_card_id_invalid"
  | "cost_limit_reached";

export function calculateLoadoutCost(loadout: PlayerLoadout): number {
  const characterCost =
    (getCharacterDefinition(loadout.primaryCharacterId)?.cost ?? 0) +
    (getCharacterDefinition(loadout.alternateCharacterId)?.cost ?? 0);
  const cardCost = loadout.abilityCardIds.reduce(
    (sum, cardId) => sum + (getAbilityCardDefinition(cardId)?.cost ?? 0),
    0,
  );

  return characterCost + cardCost;
}

export function validateLoadout(
  loadout: PlayerLoadout,
  options: LoadoutValidationOptions = {},
): LoadoutValidationResult {
  const mode = options.mode ?? "standard";
  const costLimit = options.costLimit ?? DEFAULT_COST_LIMIT;
  const errors: LoadoutValidationError[] = [];
  const primary = getCharacterDefinition(loadout.primaryCharacterId);
  const alternate = getCharacterDefinition(loadout.alternateCharacterId);
  const cards = loadout.abilityCardIds.map((id) => getAbilityCardDefinition(id));
  const activeCards = cards.filter((card) => card?.kind === "active");

  if (!primary) {
    errors.push("primary_character_missing");
  }

  if (!alternate) {
    errors.push("alternate_character_missing");
  }

  if (loadout.primaryCharacterId === loadout.alternateCharacterId) {
    errors.push("duplicate_characters");
  }

  if (cards.some((card) => !card)) {
    errors.push("ability_card_missing");
  }

  if (activeCards.length > 1) {
    errors.push("too_many_active_cards");
  }

  if (activeCards.length === 1) {
    if (!loadout.activeAbilityCardId) {
      errors.push("active_card_id_required");
    } else if (loadout.activeAbilityCardId !== activeCards[0]?.id) {
      errors.push("active_card_id_invalid");
    }
  } else if (loadout.activeAbilityCardId) {
    errors.push("active_card_id_invalid");
  }

  const totalCost = calculateLoadoutCost(loadout);

  if (mode === "standard" && totalCost > costLimit) {
    errors.push("cost_limit_reached");
  }

  return {
    valid: errors.length === 0,
    totalCost,
    errors,
  };
}
