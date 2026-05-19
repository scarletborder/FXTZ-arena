import { randomUUID } from "node:crypto";

import type { MapId, RoomStatus, RoomSummary } from "@repo/types";

import type { InternalRoom } from "./types";
import { MAX_PLAYERS_PER_ROOM } from "./types";

export interface CreateRoomParams {
  name: string;
  password?: string;
  mapId: MapId;
  lifeCount: number;
  costLimit: number;
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
      status: "waiting",
      connectionIds: [null, null],
      playerSlots: [null, null],
      loadouts: [null, null],
      loadingDone: [false, false],
      lobbyReady: [false, false],
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
  ): { slotIndex: number; playerId: "player-1" | "player-2" } | null {
    const slotIndex = this.getOpenSlotIndex(room);
    if (slotIndex === -1) return null;
    room.connectionIds[slotIndex] = connectionId;
    const playerId = slotIndex === 0 ? "player-1" : "player-2";
    room.playerSlots[slotIndex] = playerId;

    return { slotIndex, playerId };
  }

  removePlayer(room: InternalRoom, connectionId: string): void {
    const idx = room.connectionIds.indexOf(connectionId);
    if (idx !== -1) {
      room.connectionIds[idx] = null;
      room.playerSlots[idx] = null;
      room.loadouts[idx] = null;
      room.loadingDone[idx] = false;
      room.lobbyReady[idx] = false;

      // Transition back to waiting if a slot opened up
      if (room.status === "selecting" || room.status === "loading") {
        room.status = "waiting";
      }
    }
  }

  getPublicRooms(): RoomSummary[] {
    const result: RoomSummary[] = [];
    for (const room of Array.from(this.rooms.values())) {
      if (room.password) continue;
      const openSlot = this.getOpenSlotIndex(room);
      if (openSlot === -1) continue;
      result.push(this.toSummary(room));
    }
    return result;
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
    };
  }

  getAllRooms(): InternalRoom[] {
    return Array.from(this.rooms.values());
  }

  count(): number {
    return this.rooms.size;
  }
}
