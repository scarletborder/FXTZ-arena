export const TICK_RATE = 60;
export const DEFAULT_LIVES = 2;
export const DEFAULT_BOMBS = 3;
export const DEFAULT_COST_LIMIT = 10;

export type CharacterId = "reimu" | "marisa" | "sakuya";

export type PlayerId = "player-1" | "player-2";

export interface FrameInput {
  readonly frame: number;
  readonly playerId: PlayerId;
  readonly moveX: -1 | 0 | 1;
  readonly moveY: -1 | 0 | 1;
  readonly aimRadians: number;
  readonly fire: boolean;
  readonly bomb: boolean;
  readonly reload: boolean;
  readonly switchCharacter: boolean;
}

export interface CharacterDefinition {
  readonly id: CharacterId;
  readonly name: string;
  readonly cost: number;
}

export const DEFAULT_CHARACTERS: readonly CharacterDefinition[] = [
  { id: "reimu", name: "博丽灵梦", cost: 3 },
  { id: "marisa", name: "雾雨魔理沙", cost: 4 },
  { id: "sakuya", name: "十六夜咲夜", cost: 4 },
];
