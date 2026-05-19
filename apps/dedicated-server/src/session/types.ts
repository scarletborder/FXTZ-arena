import type { PlayerId } from "@repo/types";

export interface PlayerSession {
  connectionId: string;
  username: string;
  playerId: PlayerId | null;
  roomId: string | null;
  connected: boolean;
  joinedAt: number;
  debug: boolean;
  clientVersion: string;
}
