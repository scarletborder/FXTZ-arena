import type { BattleConfig, MapId, PlayerId } from "@repo/types";
import type { BattleLoadouts, RaidLogicRuntime } from "@repo/raid-logic";

export type { BattleLoadouts, FighterLoadout } from "@repo/raid-logic";

export interface BattleSceneData {
  readonly mode?: "ai" | "training" | "online";
  readonly playerName?: string;
  readonly opponentName?: string;
  readonly returnScene?: string;
  readonly loadouts?: BattleLoadouts;
  readonly mapId?: MapId;
  readonly debug?: boolean;
  readonly battleConfig?: BattleConfig;
  readonly localPlayerId?: PlayerId;
  readonly runtime?: RaidLogicRuntime;
}
