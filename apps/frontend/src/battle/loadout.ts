import type {
  BattleConfig,
  BattleLoadouts,
  BattleRoomMode,
  MapId,
  PlayerId,
  ServerMessage,
} from "@repo/types";
import type { RaidLogicRuntime } from "@repo/raid-logic";
import type { PeerConnection } from "../network/p2p";
import type { StoryAiOverride, StoryBattleContext } from "../story/types";
import type { ReplayFile } from "../replay/types";
import type { SpectatorInputBuffer } from "../replay/spectator/spectator-buffer";
import type { UdpDirectSession } from "../network/udp-direct-session";
import type { DebugCooperateRuntimeJump } from "../menu/debug-cooperate";

export type { BattleLoadouts, FighterLoadout } from "@repo/types";

export interface BattleSceneData {
  readonly mode?: "ai" | "training" | "online" | "local";
  readonly playerName?: string;
  readonly opponentName?: string;
  readonly returnScene?: string;
  readonly loadouts?: BattleLoadouts;
  readonly mapId?: MapId;
  readonly battleMode?: BattleRoomMode;
  readonly playerInitPoint?: number;
  readonly opponentInitPoint?: number;
  readonly debug?: boolean;
  readonly localSingleDevice?: boolean;
  readonly battleConfig?: BattleConfig;
  readonly localPlayerId?: PlayerId;
  readonly runtime?: RaidLogicRuntime;
  readonly p2p?: PeerConnection;
  readonly spectatorForward?: (message: ServerMessage) => void;
  readonly spectatorCountProvider?: () => number;
  readonly ai?: StoryAiOverride;
  readonly story?: StoryBattleContext;
  readonly debugCooperate?: {
    readonly jump?: DebugCooperateRuntimeJump;
  };
  /** performance.now() timestamp used as battle frame 0 after the loading countdown. */
  readonly battleZeroTimeMs?: number;
  /** Replay playback mode data. */
  readonly replayData?: {
    readonly inputs: ReplayFile["battles"][number]["inputs"];
    readonly speed: number;
    readonly loadouts: BattleLoadouts;
    readonly mapId?: string;
    readonly playerInitPoint?: number;
    readonly opponentInitPoint?: number;
    readonly exitScene?: string;
  };
  /** Live spectator playback mode data. */
  readonly spectatorData?: {
    readonly battleConfig: BattleConfig;
    readonly inputBuffer: SpectatorInputBuffer;
    readonly exitScene?: string;
    readonly udpSession?: UdpDirectSession | null;
  };
}
