import type { AbilityCardDefinition, CharacterDefinition } from "@repo/content";

export interface FighterLoadout {
  readonly primaryCharacterId: CharacterDefinition["id"];
  readonly alternateCharacterId: CharacterDefinition["id"];
  readonly activeCardId?: AbilityCardDefinition["id"];
}

export interface BattleLoadouts {
  readonly player: FighterLoadout;
  readonly target: FighterLoadout;
}

export interface BattleSceneData {
  readonly mode?: "ai" | "training";
  readonly playerName?: string;
  readonly opponentName?: string;
  readonly returnScene?: string;
  readonly loadouts?: BattleLoadouts;
}

