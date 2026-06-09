import { randomUUID } from "node:crypto";

import type { MapId, RoomStatus, RoomSummary } from "@repo/types";

import type { InternalRoom } from "./types";
import { MAX_PLAYERS_PER_ROOM } from "./types";
import { PlayerId } from "@repo/types";

export interface CreateRoomParams {
  name: string;
  password?: string;
  mapId: MapId;
  lifeCount: number;
  costLimit: number;
  allowSpectators?: boolean;
}

export class RoomManager {
  private rooms = new Map<string, InternalRoom>();

  create(params: CreateRoomParams): InternalRoom {
    const id = randomUUID().slice(0, 8);
    const room: InternalRoom = {
      id,
      name: params.name,
      password: params.password ?? null,
      mapId: params.mapId,
      lifeCount: params.lifeCount,
      costLimit: params.costLimit,
      allowSpectators: params.allowSpectators ?? true,
      status: "waiting",
      connectionIds: [null, null],
      playerSlots: [null, null],
      p2pEnabledSlots: [null, null],
      loadouts: [null, null],
      loadingDone: [false, false],
      lobbyReady: [false, false],
      disconnectedAt: [null, null],
      disconnectTimers: [null, null],
      lastAckFrameIds: [0, 0],
      gameOverVerdicts: [null, null],
      spectatorConnectionIds: [],
      spectatorInputHistory: [],
      createdAt: Date.now(),
      battleId: null,
      seed: null,
    };
    this.rooms.set(id, room);
    return room;
  }

  get(id: string): InternalRoom | undefined {
    return this.rooms.get(id);
  }

  delete(id: string): boolean {
    return this.rooms.delete(id);
  }

  getOpenSlotIndex(room: InternalRoom): number {
    return room.connectionIds.findIndex((c) => c === null);
  }

  assignSlot(
    room: InternalRoom,
    connectionId: string,
  ): { slotIndex: number; playerId: PlayerId } | null {
    const slotIndex = this.getOpenSlotIndex(room);
    if (slotIndex === -1) return null;
    room.connectionIds[slotIndex] = connectionId;
    const playerId = slotIndex === 0 ? "Player1" : "Player2";
    room.playerSlots[slotIndex] = playerId;
    room.disconnectedAt[slotIndex] = null;
    const timer = room.disconnectTimers[slotIndex];
    if (timer) {
      clearTimeout(timer);
      room.disconnectTimers[slotIndex] = null;
    }

    return { slotIndex, playerId };
  }

  addSpectator(room: InternalRoom, connectionId: string): void {
    if (!room.spectatorConnectionIds.includes(connectionId)) {
      room.spectatorConnectionIds.push(connectionId);
    }
  }

  reconnectSlot(room: InternalRoom, slotIndex: number, connectionId: string): { playerId: PlayerId } | null {
    if (slotIndex < 0 || slotIndex >= room.connectionIds.length) return null;
    const playerId = room.playerSlots[slotIndex];
    if (!playerId) return null;
    room.connectionIds[slotIndex] = connectionId;
    room.disconnectedAt[slotIndex] = null;
    const timer = room.disconnectTimers[slotIndex];
    if (timer) {
      clearTimeout(timer);
      room.disconnectTimers[slotIndex] = null;
    }
    return { playerId };
  }

  removePlayer(room: InternalRoom, connectionId: string): void {
    const spectatorIndex = room.spectatorConnectionIds.indexOf(connectionId);
    if (spectatorIndex !== -1) {
      room.spectatorConnectionIds.splice(spectatorIndex, 1);
      return;
    }

    const idx = room.connectionIds.indexOf(connectionId);
    if (idx !== -1) {
      room.connectionIds[idx] = null;
      room.playerSlots[idx] = null;
      room.p2pEnabledSlots[idx] = null;
      room.loadouts[idx] = null;
      room.loadingDone[idx] = false;
      room.lobbyReady[idx] = false;
      room.disconnectedAt[idx] = null;
      room.lastAckFrameIds[idx] = 0;
      room.gameOverVerdicts[idx] = null;
      const timer = room.disconnectTimers[idx];
      if (timer) {
        clearTimeout(timer);
        room.disconnectTimers[idx] = null;
      }

      // Transition back to waiting if a slot opened up
      if (room.status === "selecting" || room.status === "loading") {
        room.status = "waiting";
      }
    }
  }

  removeSlot(room: InternalRoom, slotIndex: number): void {
    const connectionId = room.connectionIds[slotIndex];
    if (connectionId) {
      this.removePlayer(room, connectionId);
      return;
    }
    room.connectionIds[slotIndex] = null;
    room.playerSlots[slotIndex] = null;
    room.p2pEnabledSlots[slotIndex] = null;
    room.loadouts[slotIndex] = null;
    room.loadingDone[slotIndex] = false;
    room.lobbyReady[slotIndex] = false;
    room.disconnectedAt[slotIndex] = null;
    room.lastAckFrameIds[slotIndex] = 0;
    room.gameOverVerdicts[slotIndex] = null;
    const timer = room.disconnectTimers[slotIndex];
    if (timer) {
      clearTimeout(timer);
      room.disconnectTimers[slotIndex] = null;
    }
    if (room.status === "selecting" || room.status === "loading" || room.status === "fighting") {
      room.status = "finished";
    }
  }

  getPublicRooms(): RoomSummary[] {
    const result: RoomSummary[] = [];
    for (const room of Array.from(this.rooms.values())) {
      if (room.password) continue;
      if (room.status !== "waiting") continue;
      const openSlot = this.getOpenSlotIndex(room);
      if (openSlot === -1) continue;
      result.push(this.toSummary(room));
    }
    return result;
  }

  getListableRooms(): InternalRoom[] {
    return Array.from(this.rooms.values()).filter((room) => {
      if (room.status !== "waiting") return false;
      return this.getOpenSlotIndex(room) !== -1;
    });
  }

  getSpectatableRooms(): InternalRoom[] {
    return Array.from(this.rooms.values()).filter((room) => room.allowSpectators);
  }

  toSummary(room: InternalRoom): RoomSummary {
    return {
      id: room.id,
      name: room.name,
      hasPassword: room.password !== null,
      mapId: room.mapId,
      lifeCount: room.lifeCount,
      costLimit: room.costLimit,
      playerCount: room.connectionIds.filter((c) => c !== null).length,
      maxPlayers: MAX_PLAYERS_PER_ROOM,
      status: room.status as RoomStatus,
      allowSpectators: room.allowSpectators,
      spectatorCount: room.spectatorConnectionIds.length,
    };
  }

  getAllRooms(): InternalRoom[] {
    return Array.from(this.rooms.values());
  }

  count(): number {
    return this.rooms.size;
  }
}
