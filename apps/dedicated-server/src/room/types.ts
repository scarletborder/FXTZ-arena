import type { MapId, PlayerId, PlayerLoadout, RoomStatus, ServerMessage } from "@repo/types";

export interface InternalRoom {
  id: string;
  name: string;
  password: string | null;
  mapId: MapId;
  lifeCount: number;
  costLimit: number;
  allowSpectators: boolean;
  status: RoomStatus;
  connectionIds: (string | null)[]; // [Player1 connectionId, Player2 connectionId]
  playerSlots: (PlayerId | null)[]; // ["Player1" | "Player2" | null]
  p2pEnabledSlots: (boolean | null)[];
  loadouts: (PlayerLoadout | null)[];
  loadingDone: boolean[];
  lobbyReady: boolean[];
  disconnectedAt: (number | null)[];
  disconnectTimers: (ReturnType<typeof setTimeout> | null)[];
  lastAckFrameIds: number[];
  gameOverVerdicts: ({ frame: number; ackFrame: number; winnerPlayerId: PlayerId } | null)[];
  spectatorConnectionIds: string[];
  spectatorInputHistory: Extract<ServerMessage, { type: "input_frame" }>[];
  createdAt: number;
  battleId: string | null;
  seed: number | null;
}

export const MAX_PLAYERS_PER_ROOM = 2;
