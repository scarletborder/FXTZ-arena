import { describe, it, expect } from "vitest";

import { SessionStore } from "../session/store";

describe("SessionStore", () => {
  it("creates and retrieves a session", () => {
    const store = new SessionStore();
    const session = store.create("conn-1", "Player1", "1.0.0", false);

    expect(session.connectionId).toBe("conn-1");
    expect(session.username).toBe("Player1");
    expect(session.playerId).toBeNull();
    expect(session.roomId).toBeNull();
    expect(session.connected).toBe(true);

    const retrieved = store.get("conn-1");
    expect(retrieved).toEqual(session);
  });

  it("returns undefined for non-existent session", () => {
    const store = new SessionStore();
    expect(store.get("nonexistent")).toBeUndefined();
  });

  it("removes a session", () => {
    const store = new SessionStore();
    store.create("conn-1", "Player1", "1.0.0", false);
    store.remove("conn-1");
    expect(store.get("conn-1")).toBeUndefined();
  });

  it("sets playerId on a session", () => {
    const store = new SessionStore();
    store.create("conn-1", "Player1", "1.0.0", false);
    store.setPlayerId("conn-1", "Player1");
    expect(store.get("conn-1")?.playerId).toBe("Player1");
  });

  it("sets roomId on a session", () => {
    const store = new SessionStore();
    store.create("conn-1", "Player1", "1.0.0", false);
    store.setRoomId("conn-1", "room-1");
    expect(store.get("conn-1")?.roomId).toBe("room-1");
  });

  it("clears roomId on a session", () => {
    const store = new SessionStore();
    store.create("conn-1", "Player1", "1.0.0", false);
    store.setRoomId("conn-1", "room-1");
    store.setRoomId("conn-1", null);
    expect(store.get("conn-1")?.roomId).toBeNull();
  });

  it("sets connected state", () => {
    const store = new SessionStore();
    store.create("conn-1", "Player1", "1.0.0", false);
    store.setConnected("conn-1", false);
    expect(store.get("conn-1")?.connected).toBe(false);
  });

  it("does nothing when setting fields on non-existent session", () => {
    const store = new SessionStore();
    expect(() => {
      store.setPlayerId("nonexistent", "Player1");
      store.setRoomId("nonexistent", "room-1");
      store.setConnected("nonexistent", false);
    }).not.toThrow();
  });

  it("finds sessions by roomId", () => {
    const store = new SessionStore();
    store.create("conn-1", "Player1", "1.0.0", false);
    store.create("conn-2", "Player2", "1.0.0", false);
    store.create("conn-3", "Player3", "1.0.0", false);

    store.setRoomId("conn-1", "room-a");
    store.setRoomId("conn-2", "room-a");
    store.setRoomId("conn-3", "room-b");

    const roomA = store.getByRoomId("room-a");
    expect(roomA).toHaveLength(2);
    expect(roomA.map((s) => s.connectionId).sort()).toEqual(["conn-1", "conn-2"]);

    const roomB = store.getByRoomId("room-b");
    expect(roomB).toHaveLength(1);
    expect(roomB[0].connectionId).toBe("conn-3");

    const empty = store.getByRoomId("nonexistent");
    expect(empty).toHaveLength(0);
  });

  it("only returns connected sessions for getByRoomId", () => {
    const store = new SessionStore();
    store.create("conn-1", "Player1", "1.0.0", false);
    store.create("conn-2", "Player2", "1.0.0", false);
    store.setRoomId("conn-1", "room-a");
    store.setRoomId("conn-2", "room-a");
    store.setConnected("conn-2", false);

    const roomA = store.getByRoomId("room-a");
    expect(roomA).toHaveLength(1);
    expect(roomA[0].connectionId).toBe("conn-1");
  });

  it("returns all sessions", () => {
    const store = new SessionStore();
    store.create("conn-1", "Player1", "1.0.0", false);
    store.create("conn-2", "Player2", "1.0.0", false);
    expect(store.getAll()).toHaveLength(2);
  });

  it("reports correct count", () => {
    const store = new SessionStore();
    expect(store.count()).toBe(0);
    store.create("conn-1", "Player1", "1.0.0", false);
    expect(store.count()).toBe(1);
    store.create("conn-2", "Player2", "1.0.0", false);
    expect(store.count()).toBe(2);
    store.remove("conn-1");
    expect(store.count()).toBe(1);
  });
});
