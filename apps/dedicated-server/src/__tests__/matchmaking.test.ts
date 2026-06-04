import { describe, it, expect } from "vitest";

import { findQuickMatchRoom } from "../matchmaking";
import type { InternalRoom } from "../room/types";

function createRoom(overrides?: Partial<InternalRoom>): InternalRoom {
  return {
    id: "room-001",
    name: "Test Room",
    password: null,
    mapId: "hakurei_shrine",
    lifeCount: 2,
    costLimit: 10,
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
    createdAt: Date.now(),
    battleId: null,
    seed: null,
    ...overrides,
  };
}

describe("findQuickMatchRoom", () => {
  it("returns null when no rooms available", () => {
    const result = findQuickMatchRoom([]);
    expect(result).toBeNull();
  });

  it("returns a room with an open slot", () => {
    const room = createRoom();
    const result = findQuickMatchRoom([room]);
    expect(result).toBe(room);
  });

  it("prefers rooms with one player already", () => {
    const empty = createRoom({ id: "empty" });
    const partial = createRoom({
      id: "partial",
      connectionIds: ["conn-1", null],
      playerSlots: ["Player1", null],
    });
    const full = createRoom({
      id: "full",
      connectionIds: ["conn-1", "conn-2"],
      playerSlots: ["Player1", "Player2"],
    });

    const result = findQuickMatchRoom([empty, partial, full]);
    // Should prefer partial (has 1 player) over empty (has 0)
    expect(result?.id).toBe("partial");
  });

  it("excludes password-protected rooms", () => {
    const room = createRoom({ password: "secret" });
    const result = findQuickMatchRoom([room]);
    expect(result).toBeNull();
  });

  it("excludes rooms not in waiting status", () => {
    const selecting = createRoom({ status: "selecting" });
    const loading = createRoom({ id: "loading", status: "loading" });
    const fighting = createRoom({ id: "fighting", status: "fighting" });
    const finished = createRoom({ id: "finished", status: "finished" });

    expect(findQuickMatchRoom([selecting])).toBeNull();
    expect(findQuickMatchRoom([loading])).toBeNull();
    expect(findQuickMatchRoom([fighting])).toBeNull();
    expect(findQuickMatchRoom([finished])).toBeNull();
  });

  it("excludes full rooms", () => {
    const full = createRoom({
      connectionIds: ["conn-1", "conn-2"],
      playerSlots: ["Player1", "Player2"],
    });
    const result = findQuickMatchRoom([full]);
    expect(result).toBeNull();
  });

  it("picks from available rooms when multiple are valid", () => {
    const room1 = createRoom({ id: "room-1" });
    const room2 = createRoom({ id: "room-2" });

    const result = findQuickMatchRoom([room1, room2]);
    expect(result).not.toBeNull();
    expect([room1, room2]).toContain(result);
  });

  it("returns the only available room when others are filtered out", () => {
    const locked = createRoom({ id: "locked", password: "x" });
    const available = createRoom({ id: "available" });
    const full = createRoom({
      id: "full",
      connectionIds: ["conn-1", "conn-2"],
      playerSlots: ["Player1", "Player2"],
    });

    const result = findQuickMatchRoom([locked, available, full]);
    expect(result?.id).toBe("available");
  });
});
