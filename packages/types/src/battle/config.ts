import {
  DEFAULT_BOMBS,
  DEFAULT_COST_LIMIT,
  DEFAULT_LIVES,
  TICK_RATE,
} from "../core";
import type { MapId, PlayerId } from "../core";
import type { PlayerLoadout } from "./loadout";

export interface BattlePlayerConfig {
  readonly playerId: PlayerId;
  readonly username: string;
  readonly loadout: PlayerLoadout;
  readonly spawnPointId: string;
}

export interface BattleConfig {
  readonly battleId: string;
  readonly mapId: MapId;
  readonly seed: number;
  readonly fps: typeof TICK_RATE;
  readonly lifeCount: number;
  readonly defaultBombCount: number;
  readonly costLimit: number;
  readonly p2pEnabled?: boolean;
  readonly players: readonly [BattlePlayerConfig, BattlePlayerConfig];
}

export function createDefaultBattleConfig(
  battleId: string,
  players: readonly [BattlePlayerConfig, BattlePlayerConfig],
): BattleConfig {
  return {
    battleId,
    mapId: "arena_standard",
    seed: 1,
    fps: TICK_RATE,
    lifeCount: DEFAULT_LIVES,
    defaultBombCount: DEFAULT_BOMBS,
    costLimit: DEFAULT_COST_LIMIT,
    players,
  };
}
