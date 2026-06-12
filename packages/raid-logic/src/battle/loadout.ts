import type { AbilityCardDefinition, CharacterDefinition } from "@repo/content";

export interface FighterLoadout {
  readonly primaryCharacterId: CharacterDefinition["id"];
  readonly alternateCharacterId: CharacterDefinition["id"];
  readonly cardIds?: readonly AbilityCardDefinition["id"][];
  readonly activeCardId?: AbilityCardDefinition["id"];
  readonly storyModeOverride?: StoryModeOverride;
}

export interface BattleLoadouts {
  readonly player: FighterLoadout;
  readonly target: FighterLoadout;
}

export interface StoryModeOverride {
  readonly enabled: true;
  readonly lives: number;
  readonly bombs: number;
}
