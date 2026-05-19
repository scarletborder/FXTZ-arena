import type { AbilityCardDefinition, CharacterDefinition } from "@repo/content";
import type { BattleConfig, PlayerId } from "@repo/types";

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
  readonly mode?: "ai" | "training" | "online";
  readonly playerName?: string;
  readonly opponentName?: string;
  readonly returnScene?: string;
  readonly loadouts?: BattleLoadouts;
  readonly debug?: boolean;
  readonly battleConfig?: BattleConfig;
  readonly localPlayerId?: PlayerId;
}
