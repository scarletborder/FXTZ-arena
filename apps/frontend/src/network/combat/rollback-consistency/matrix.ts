import {
  getAllAbilityCardDefinitions,
  getAllCharacterDefinitions,
} from "@repo/content";
import type { AbilityCardId, CharacterId, PlayerLoadout } from "@repo/types";

export const LATENCY_PROFILES = [
  {
    name: "low latency 20ms vs 30ms",
    latencyMs: { Player1: 20, Player2: 30 },
  },
  {
    name: "high latency 120ms vs 150ms",
    latencyMs: { Player1: 120, Player2: 150 },
  },
] as const;

export const CHARACTER_IDS = getAllCharacterDefinitions()
  .map((definition) => definition.id as CharacterId)
  .sort();

export const ABILITY_CARD_IDS = getAllAbilityCardDefinitions()
  .map((definition) => definition.id as AbilityCardId)
  .sort();

export function characterLoadout(characterId: CharacterId): PlayerLoadout {
  const index = CHARACTER_IDS.indexOf(characterId);
  const alternateCharacterId =
    CHARACTER_IDS[(index + 1) % CHARACTER_IDS.length]!;
  return {
    primaryCharacterId: characterId,
    alternateCharacterId,
    abilityCardIds: [],
  };
}

export function abilityCardLoadout(params: {
  readonly primaryCharacterId: CharacterId;
  readonly alternateCharacterId: CharacterId;
  readonly abilityCardId: AbilityCardId;
}): PlayerLoadout {
  const definition = getAllAbilityCardDefinitions().find(
    (card) => card.id === params.abilityCardId,
  );
  if (!definition) throw new Error(`Unknown card ${params.abilityCardId}`);
  return {
    primaryCharacterId: params.primaryCharacterId,
    alternateCharacterId: params.alternateCharacterId,
    abilityCardIds: [params.abilityCardId],
    activeAbilityCardId:
      definition.kind === "active" ? params.abilityCardId : undefined,
  };
}
