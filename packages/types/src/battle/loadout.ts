import type { AbilityCardId, CharacterId } from "../core";

export interface PlayerLoadout {
  readonly primaryCharacterId: CharacterId;
  readonly alternateCharacterId: CharacterId;
  readonly abilityCardIds: readonly AbilityCardId[];
  readonly activeAbilityCardId?: AbilityCardId;
}
