import type { AbilityCardId, CharacterId } from "../core";

export interface PlayerLoadout {
  readonly primaryCharacterId: CharacterId;
  readonly alternateCharacterId: CharacterId;
  readonly abilityCardIds: readonly AbilityCardId[];
  readonly activeAbilityCardId?: AbilityCardId;
}

export interface FighterLoadout {
  readonly primaryCharacterId: CharacterId;
  readonly alternateCharacterId: CharacterId;
  readonly cardIds?: readonly AbilityCardId[];
  readonly activeCardId?: AbilityCardId;
  readonly storyModeOverride?: StoryModeOverride;
}

export interface BattleLoadouts {
  readonly player: FighterLoadout;
  readonly target: FighterLoadout;
}

export interface StoryModeOverride {
  readonly enabled: true;
  readonly lives: number;
  readonly bombs?: number;
}
