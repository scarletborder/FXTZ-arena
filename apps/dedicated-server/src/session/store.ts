import type { PlayerId } from "@repo/types";
import type { PlayerSession } from "./types";

export class SessionStore {
  private sessions = new Map<string, PlayerSession>();

  create(
    connectionId: string,
    username: string,
    clientVersion: string,
    debug: boolean,
  ): PlayerSession {
    const session: PlayerSession = {
      connectionId,
      username,
      playerId: null,
      roomId: null,
      connected: true,
      joinedAt: Date.now(),
      debug,
      clientVersion,
    };
    this.sessions.set(connectionId, session);
    return session;
  }

  get(connectionId: string): PlayerSession | undefined {
    return this.sessions.get(connectionId);
  }

  remove(connectionId: string): void {
    this.sessions.delete(connectionId);
  }

  setPlayerId(connectionId: string, playerId: PlayerId): void {
    const session = this.sessions.get(connectionId);
    if (session) {
      session.playerId = playerId;
    }
  }

  setRoomId(connectionId: string, roomId: string | null): void {
    const session = this.sessions.get(connectionId);
    if (session) {
      session.roomId = roomId;
    }
  }

  setConnected(connectionId: string, connected: boolean): void {
    const session = this.sessions.get(connectionId);
    if (session) {
      session.connected = connected;
    }
  }

  getByRoomId(roomId: string): PlayerSession[] {
    return Array.from(this.sessions.values()).filter(
      (s) => s.roomId === roomId && s.connected,
    );
  }

  findByRoomAndPlayer(roomId: string, playerId: PlayerId): PlayerSession | undefined {
    return Array.from(this.sessions.values()).find(
      (s) => s.roomId === roomId && s.playerId === playerId,
    );
  }

  getAll(): PlayerSession[] {
    return Array.from(this.sessions.values());
  }

  count(): number {
    return this.sessions.size;
  }
}
