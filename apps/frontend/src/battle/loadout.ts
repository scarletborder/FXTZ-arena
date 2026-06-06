import type { BattleConfig, MapId, PlayerId } from "@repo/types";
import type { BattleLoadouts, RaidLogicRuntime } from "@repo/raid-logic";
import type { PeerConnection } from "../network/p2p";
import type { StoryAiOverride, StoryBattleContext } from "../story/types";

export type { BattleLoadouts, FighterLoadout } from "@repo/raid-logic";

export interface BattleSceneData {
  readonly mode?: "ai" | "training" | "online" | "local";
  readonly playerName?: string;
  readonly opponentName?: string;
  readonly returnScene?: string;
  readonly loadouts?: BattleLoadouts;
  readonly mapId?: MapId;
  readonly debug?: boolean;
  readonly battleConfig?: BattleConfig;
  readonly localPlayerId?: PlayerId;
  readonly runtime?: RaidLogicRuntime;
  readonly p2p?: PeerConnection;
  readonly ai?: StoryAiOverride;
  readonly story?: StoryBattleContext;
  /** performance.now() timestamp used as battle frame 0 after the loading countdown. */
  readonly battleZeroTimeMs?: number;
}
