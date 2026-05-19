import { describe, it, expect } from "vitest";

import { RoomManager } from "../room/manager";

const defaultParams = {
  name: "Test Room",
  mapId: "arena_standard" as const,
  lifeCount: 2,
  costLimit: 10,
};

describe("RoomManager", () => {
  it("creates a room with default fields", () => {
    const mgr = new RoomManager();
    const room = mgr.create(defaultParams);

    expect(room.id).toBeDefined();
    expect(room.id.length).toBe(8);
    expect(room.name).toBe("Test Room");
    expect(room.password).toBeNull();
    expect(room.mapId).toBe("arena_standard");
    expect(room.lifeCount).toBe(2);
    expect(room.costLimit).toBe(10);
    expect(room.status).toBe("waiting");
    expect(room.connectionIds).toEqual([null, null]);
    expect(room.playerSlots).toEqual([null, null]);
    expect(room.loadouts).toEqual([null, null]);
    expect(room.loadingDone).toEqual([false, false]);
    expect(room.disconnectedAt).toEqual([null, null]);
    expect(room.lastAckFrameIds).toEqual([0, 0]);
    expect(room.gameOverVerdicts).toEqual([null, null]);
    expect(room.battleId).toBeNull();
    expect(room.seed).toBeNull();
    expect(room.createdAt).toBeGreaterThan(0);
  });

  it("creates a room with a password", () => {
    const mgr = new RoomManager();
    const room = mgr.create({ ...defaultParams, password: "secret" });
    expect(room.password).toBe("secret");
  });

  it("retrieves a room by ID", () => {
    const mgr = new RoomManager();
    const room = mgr.create(defaultParams);
    expect(mgr.get(room.id)).toBe(room);
  });

  it("returns undefined for non-existent room", () => {
    const mgr = new RoomManager();
    expect(mgr.get("nonexistent")).toBeUndefined();
  });

  it("deletes a room", () => {
    const mgr = new RoomManager();
    const room = mgr.create(defaultParams);
    expect(mgr.delete(room.id)).toBe(true);
    expect(mgr.get(room.id)).toBeUndefined();
  });

  it("returns false when deleting non-existent room", () => {
    const mgr = new RoomManager();
    expect(mgr.delete("nonexistent")).toBe(false);
  });

  it("finds open slot index", () => {
    const mgr = new RoomManager();
    const room = mgr.create(defaultParams);
    expect(mgr.getOpenSlotIndex(room)).toBe(0);
  });

  it("assigns player-1 to the first slot", () => {
    const mgr = new RoomManager();
    const room = mgr.create(defaultParams);
    const result = mgr.assignSlot(room, "conn-1");

    expect(result).toEqual({ slotIndex: 0, playerId: "player-1" });
    expect(room.connectionIds[0]).toBe("conn-1");
    expect(room.playerSlots[0]).toBe("player-1");
  });

  it("assigns player-2 to the second slot", () => {
    const mgr = new RoomManager();
    const room = mgr.create(defaultParams);
    mgr.assignSlot(room, "conn-1");
    const result = mgr.assignSlot(room, "conn-2");

    expect(result).toEqual({ slotIndex: 1, playerId: "player-2" });
    expect(room.connectionIds[1]).toBe("conn-2");
    expect(room.playerSlots[1]).toBe("player-2");
  });

  it("returns null when room is full", () => {
    const mgr = new RoomManager();
    const room = mgr.create(defaultParams);
    mgr.assignSlot(room, "conn-1");
    mgr.assignSlot(room, "conn-2");
    expect(mgr.assignSlot(room, "conn-3")).toBeNull();
  });

  it("stays in waiting when both slots are filled (lobby)", () => {
    const mgr = new RoomManager();
    const room = mgr.create(defaultParams);
    expect(room.status).toBe("waiting");
    mgr.assignSlot(room, "conn-1");
    expect(room.status).toBe("waiting");
    mgr.assignSlot(room, "conn-2");
    expect(room.status).toBe("waiting");
  });

  it("removes a player and frees their slot", () => {
    const mgr = new RoomManager();
    const room = mgr.create(defaultParams);
    mgr.assignSlot(room, "conn-1");
    mgr.assignSlot(room, "conn-2");

    mgr.removePlayer(room, "conn-1");

    expect(room.connectionIds[0]).toBeNull();
    expect(room.playerSlots[0]).toBeNull();
    expect(room.loadouts[0]).toBeNull();
    expect(room.loadingDone[0]).toBe(false);
  });

  it("transitions back to waiting when a player leaves a selecting room", () => {
    const mgr = new RoomManager();
    const room = mgr.create(defaultParams);
    mgr.assignSlot(room, "conn-1");
    mgr.assignSlot(room, "conn-2");
    room.status = "selecting"; // lobby start_game transitions to selecting

    mgr.removePlayer(room, "conn-2");
    expect(room.status).toBe("waiting");
  });

  it("returns public rooms (no password)", () => {
    const mgr = new RoomManager();
    mgr.create(defaultParams);
    mgr.create({ ...defaultParams, password: "secret" });

    const summaries = mgr.getPublicRooms();
    expect(summaries).toHaveLength(1);
    expect(summaries[0].hasPassword).toBe(false);
  });

  it("excludes full rooms from public listings", () => {
    const mgr = new RoomManager();
    const room = mgr.create(defaultParams);
    mgr.assignSlot(room, "conn-1");
    mgr.assignSlot(room, "conn-2");

    const summaries = mgr.getPublicRooms();
    expect(summaries).toHaveLength(0);
  });

  it("generates correct room summaries", () => {
    const mgr = new RoomManager();
    mgr.create(defaultParams);
    mgr.create({ ...defaultParams, name: "Locked Room", password: "x", costLimit: 5 });

    const summaries = mgr.getPublicRooms();
    expect(summaries).toHaveLength(1);
    expect(summaries[0].name).toBe("Test Room");
    expect(summaries[0].playerCount).toBe(0);
    expect(summaries[0].maxPlayers).toBe(2);
    expect(summaries[0].status).toBe("waiting");
    expect(summaries[0].lifeCount).toBe(2);
    expect(summaries[0].costLimit).toBe(10);
  });

  it("generates summary for a specific room", () => {
    const mgr = new RoomManager();
    const room = mgr.create(defaultParams);
    mgr.assignSlot(room, "conn-1");

    const summary = mgr.toSummary(room);
    expect(summary.playerCount).toBe(1);
    expect(summary.hasPassword).toBe(false);
  });

  it("reports correct count", () => {
    const mgr = new RoomManager();
    expect(mgr.count()).toBe(0);
    mgr.create(defaultParams);
    expect(mgr.count()).toBe(1);
    mgr.create(defaultParams);
    expect(mgr.count()).toBe(2);
  });

  it("returns all rooms", () => {
    const mgr = new RoomManager();
    const r1 = mgr.create(defaultParams);
    const r2 = mgr.create(defaultParams);
    expect(mgr.getAllRooms()).toHaveLength(2);
    expect(mgr.getAllRooms()).toContain(r1);
    expect(mgr.getAllRooms()).toContain(r2);
  });

  it("does nothing when removing non-existent player", () => {
    const mgr = new RoomManager();
    const room = mgr.create(defaultParams);
    expect(() => mgr.removePlayer(room, "nonexistent")).not.toThrow();
  });
});
