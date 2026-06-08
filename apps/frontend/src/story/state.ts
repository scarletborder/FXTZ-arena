import { EnumDifficulty, type AbilityCardId, type CharacterId } from "@repo/types";

import type { StoryDefinition, StoryRuntimeState, StoryStageReward, StoryStats } from "./types";

const EMPTY_STATS: StoryStats = {
  battles: 0,
  wins: 0,
  shots: 0,
  bombUses: 0,
  hitsTaken: 0,
};

export function createInitialStoryState(
  story: StoryDefinition,
  primaryCharacterId: CharacterId,
  difficulty: EnumDifficulty = EnumDifficulty.Normal,
): StoryRuntimeState {
  return {
    storyId: story.id,
    difficulty,
    primaryCharacterId,
    cardIds: [],
    currentStageIndex: 0,
    lives: story.initialLives,
    bombs: story.initialBombs,
    stats: EMPTY_STATS,
  };
}

export function updateStoryLoadout(
  state: StoryRuntimeState,
  params: {
    readonly alternateCharacterId: CharacterId;
    readonly cardIds: readonly AbilityCardId[];
    readonly activeCardId?: AbilityCardId;
  },
): StoryRuntimeState {
  return {
    ...state,
    alternateCharacterId: params.alternateCharacterId,
    cardIds: [...params.cardIds],
    activeCardId: params.activeCardId,
  };
}

export function applyStoryReward(
  state: StoryRuntimeState,
  reward: StoryStageReward | undefined,
): StoryRuntimeState {
  if (!reward) {
    return state;
  }
  return {
    ...state,
    lives: state.lives + (reward.lives ?? 0),
    bombs: state.bombs + (reward.bombs ?? 0),
  };
}

export function advanceStoryAfterBattle(
  state: StoryRuntimeState,
  params: {
    readonly lives: number;
    readonly bombs: number;
    readonly shots: number;
    readonly bombUses: number;
    readonly hitsTaken: number;
    readonly won: boolean;
  },
): StoryRuntimeState {
  return {
    ...state,
    currentStageIndex: params.won ? state.currentStageIndex + 1 : state.currentStageIndex,
    lives: Math.max(0, Math.trunc(params.lives)),
    bombs: Math.max(0, Math.trunc(params.bombs)),
    stats: {
      battles: state.stats.battles + 1,
      wins: state.stats.wins + (params.won ? 1 : 0),
      shots: state.stats.shots + params.shots,
      bombUses: state.stats.bombUses + params.bombUses,
      hitsTaken: state.stats.hitsTaken + params.hitsTaken,
    },
  };
}
