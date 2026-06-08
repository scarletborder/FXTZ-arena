import type { AbilityCardId, CharacterId, EnumDifficulty, MapId } from "@repo/types";
import type { ReplayFile } from "../replay/types";

export type StoryId = "reimu" | "marisa";
export type StoryRewardKind = "life" | "bomb";

export interface StoryDialogueLine {
  readonly speaker: string;
  readonly content: string;
  readonly color?: string;
  readonly background?: "black" | string;
  readonly game_end?: boolean;
}

export interface StoryStageReward {
  readonly lives?: number;
  readonly bombs?: number;
}

export interface StoryAiOverride {
  readonly smartDurationSeconds: number;
  readonly dumbRampSeconds: number;
}

export interface StoryOpponentLoadout {
  readonly primaryCharacterId: CharacterId;
  readonly alternateCharacterId: CharacterId;
  readonly cardIds?: readonly AbilityCardId[];
  readonly activeCardId?: AbilityCardId;
}

export interface StoryStage {
  readonly id: string;
  readonly title: string;
  readonly mapId: MapId;
  readonly icon: "hakurei_shrine" | "mist_lake" | "bamboo_lost" | "mana_forest" | "shoot_range";
  readonly costLimit: number;
  readonly reward?: StoryStageReward;
  readonly opponent: StoryOpponentLoadout;
  readonly ai: StoryAiOverride;
  readonly initEnemyPoint: number | undefined;
  readonly script: readonly StoryDialogueLine[];
}

export interface StoryDefinition {
  readonly id: StoryId;
  readonly title: string;
  readonly playableCharacterId: CharacterId;
  readonly initialLives: number;
  readonly initialBombs: number;
  readonly stages: readonly StoryStage[];
  readonly endingScript: readonly StoryDialogueLine[];
  readonly staff: readonly string[];
}

export interface StoryStats {
  readonly battles: number;
  readonly wins: number;
  readonly shots: number;
  readonly bombUses: number;
  readonly hitsTaken: number;
}

export interface StoryRuntimeState {
  readonly storyId: StoryId;
  readonly difficulty: EnumDifficulty;
  readonly primaryCharacterId: CharacterId;
  readonly alternateCharacterId?: CharacterId;
  readonly cardIds: readonly AbilityCardId[];
  readonly activeCardId?: AbilityCardId;
  readonly currentStageIndex: number;
  readonly lives: number;
  readonly bombs: number;
  readonly stats: StoryStats;
}

export interface StoryProgressData {
  readonly state: StoryRuntimeState;
  readonly fromBattle?: boolean;
  readonly clearedStageIndex?: number;
  readonly rewardApplied?: StoryStageReward;
}

export interface StoryLoadoutData {
  readonly story: StoryDefinition;
  readonly state: StoryRuntimeState;
}

export interface StoryBattleContext {
  readonly story: StoryDefinition;
  readonly state: StoryRuntimeState;
  readonly stageIndex: number;
}

export interface StoryResultData {
  readonly story?: StoryDefinition;
  readonly state?: StoryRuntimeState;
  readonly success?: boolean;
  readonly replay?: ReplayFile;
}
