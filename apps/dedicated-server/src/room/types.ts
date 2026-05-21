import type { MapId, PlayerId, PlayerLoadout, RoomStatus } from "@repo/types";

export interface InternalRoom {
  id: string;
  name: string;
  password: string | null;
  mapId: MapId;
  lifeCount: number;
  costLimit: number;
  status: RoomStatus;
  connectionIds: (string | null)[]; // [player-1 connectionId, player-2 connectionId]
  playerSlots: (PlayerId | null)[]; // ["player-1" | "player-2" | null]
  loadouts: (PlayerLoadout | null)[];
  loadingDone: boolean[];
  lobbyReady: boolean[];
  disconnectedAt: (number | null)[];
  disconnectTimers: (ReturnType<typeof setTimeout> | null)[];
  lastAckFrameIds: number[];
  gameOverVerdicts: ({ frame: number; ackFrame: number; winnerPlayerId: PlayerId } | null)[];
  createdAt: number;
  battleId: string | null;
  seed: number | null;
}

export const MAX_PLAYERS_PER_ROOM = 2;
