import { describe, it, expect, beforeEach } from "vitest";

import { DEFAULT_SERVER_CONFIG } from "../config";
import { MessageHandler } from "../protocol/handler";
import { RoomLifecycle } from "../room/lifecycle";
import { RoomManager } from "../room/manager";
import { SessionStore } from "../session/store";
import { MockConnection } from "./test-utils";
import type { ServerMessage } from "../protocol/messages";

function createHandler() {
  const sessionStore = new SessionStore();
  const roomManager = new RoomManager();
  const roomLifecycle = new RoomLifecycle();
  const handler = new MessageHandler(
    sessionStore,
    roomManager,
    roomLifecycle,
    DEFAULT_SERVER_CONFIG,
  );
  return { sessionStore, roomManager, handler };
}

function performHello(handler: MessageHandler, conn: MockConnection, username = "Player1") {
  handler.registerConnection(conn);
  handler.handle(conn, { type: "hello", username, clientVersion: "1.0.0", debug: false });
  return conn.findSentMessage("server_hello");
}

describe("MessageHandler", () => {
  describe("hello requirement", () => {
    it("rejects non-hello messages before hello", () => {
      const { handler } = createHandler();
      const conn = new MockConnection();

      handler.handle(conn, { type: "ping", seq: 1 });

      const error = conn.findSentMessage("error");
      expect(error).toBeDefined();
      expect(error?.code).toBe("hello_required");
    });

    it("accepts hello message", () => {
      const { handler } = createHandler();
      const conn = new MockConnection();

      const hello = performHello(handler, conn);
      expect(hello).toBeDefined();
      expect(hello?.serverVersion).toBe(DEFAULT_SERVER_CONFIG.serverVersion);
    });

    it("accepts other messages after hello", () => {
      const { handler } = createHandler();
      const conn = new MockConnection();

      performHello(handler, conn);
      conn.clearMessages();

      // ping should work now
      handler.handle(conn, { type: "ping", seq: 42 });
      const pong = conn.findSentMessage("pong");
      expect(pong?.seq).toBe(42);
    });

    it("rejects messages with invalid type", () => {
      const { handler } = createHandler();
      const conn = new MockConnection();

      handler.handle(conn, 123);
      const error = conn.findSentMessage("error");
      expect(error).toBeDefined();
    });

    it("rejects messages without type field", () => {
      const { handler } = createHandler();
      const conn = new MockConnection();

      handler.handle(conn, { notype: true });
      const error = conn.findSentMessage("error");
      expect(error).toBeDefined();
    });

    it("rejects unknown message types", () => {
      const { handler } = createHandler();
      const conn = new MockConnection();

      performHello(handler, conn);
      conn.clearMessages();

      handler.handle(conn, { type: "unknown_type" as any });
      const error = conn.findSentMessage("error");
      expect(error).toBeDefined();
      expect(error?.message).toContain("unknown_type");
    });
  });

  describe("hello", () => {
    it("creates a session on hello", () => {
      const { handler, sessionStore } = createHandler();
      const conn = new MockConnection();

      performHello(handler, conn, "TestPlayer");
      const session = sessionStore.get(conn.id);
      expect(session?.username).toBe("TestPlayer");
      expect(session?.debug).toBe(false);
    });

    it("returns server_hello with version", () => {
      const { handler } = createHandler();
      const conn = new MockConnection();

      const hello = performHello(handler, conn);
      expect(hello).toEqual({
        type: "server_hello",
        serverVersion: DEFAULT_SERVER_CONFIG.serverVersion,
      });
    });
  });

  describe("create room", () => {
    it("creates a room and assigns Player1", () => {
      const { handler, roomManager } = createHandler();
      const conn = new MockConnection();

      performHello(handler, conn);

      handler.handle(conn, {
        type: "create_room",
        name: "My Room",
        mapId: "arena_standard",
        lifeCount: 3,
        costLimit: 15,
      });

      expect(conn.findSentMessage("room_created")).toBeDefined();
      expect(conn.findSentMessage("room_joined")).toBeDefined();
      expect(conn.findSentMessage("room_state")).toBeDefined();

      const joined = conn.findSentMessage("room_joined");
      expect(joined?.playerId).toBe("Player1");

      const roomCreated = conn.findSentMessage("room_created");
      const room = roomManager.get(roomCreated!.roomId);
      expect(room).toBeDefined();
      expect(room?.lifeCount).toBe(3);
      expect(room?.costLimit).toBe(15);
    });

    it("uses the latest username from create_room for lobby display", () => {
      const { handler, sessionStore } = createHandler();
      const conn = new MockConnection();

      performHello(handler, conn, "Player");

      handler.handle(conn, {
        type: "create_room",
        name: "My Room",
        username: "Alice",
        mapId: "arena_standard",
        lifeCount: 3,
        costLimit: 15,
      });

      expect(sessionStore.get(conn.id)?.username).toBe("Alice");
      expect(conn.findSentMessage("room_state")?.hostName).toBe("Alice");
    });

    it("rejects create room when already in a room", () => {
      const { handler } = createHandler();
      const conn = new MockConnection();

      performHello(handler, conn);

      handler.handle(conn, {
        type: "create_room",
        name: "Room 1",
        mapId: "arena_standard",
        lifeCount: 2,
        costLimit: 10,
      });
      conn.clearMessages();

      handler.handle(conn, {
        type: "create_room",
        name: "Room 2",
        mapId: "arena_standard",
        lifeCount: 2,
        costLimit: 10,
      });

      const error = conn.findSentMessage("error");
      expect(error?.code).toBe("already_in_room");
    });
  });

  describe("join room", () => {
    it("allows a second player to join a room", () => {
      const { handler } = createHandler();
      const conn1 = new MockConnection("conn-1");
      const conn2 = new MockConnection("conn-2");

      performHello(handler, conn1, "Host");
      performHello(handler, conn2, "Joiner");

      // Create room as player 1
      handler.handle(conn1, {
        type: "create_room",
        name: "Test",
        mapId: "arena_standard",
        lifeCount: 2,
        costLimit: 10,
      });

      const roomCreated = conn1.findSentMessage("room_created")!;
      conn1.clearMessages();
      conn2.clearMessages();

      // Join as player 2
      handler.handle(conn2, {
        type: "join_room",
        roomId: roomCreated.roomId,
      });

      const joined = conn2.findSentMessage("room_joined");
      expect(joined?.playerId).toBe("Player2");

      // Host should get notified about room state change
      const hostState = conn1.findSentMessage("room_state");
      expect(hostState?.playerCount).toBe(2);
      expect(hostState?.status).toBe("waiting");
      expect(hostState?.opponentUsername).toBe("Joiner");
    });

    it("uses the latest username from join_room for both lobby views", () => {
      const { handler } = createHandler();
      const conn1 = new MockConnection("conn-1");
      const conn2 = new MockConnection("conn-2");

      performHello(handler, conn1, "Player");
      performHello(handler, conn2, "Player");

      handler.handle(conn1, {
        type: "create_room",
        name: "Test",
        username: "Alice",
        mapId: "arena_standard",
        lifeCount: 2,
        costLimit: 10,
      });

      const roomCreated = conn1.findSentMessage("room_created")!;
      conn1.clearMessages();
      conn2.clearMessages();

      handler.handle(conn2, {
        type: "join_room",
        roomId: roomCreated.roomId,
        username: "Bob",
      });

      expect(conn2.findSentMessage("room_state")?.hostName).toBe("Alice");
      expect(conn2.findSentMessage("room_state")?.opponentUsername).toBe("Alice");
      expect(conn1.findSentMessage("room_state")?.hostName).toBe("Alice");
      expect(conn1.findSentMessage("room_state")?.opponentUsername).toBe("Bob");
    });

    it("rejects joining a non-existent room", () => {
      const { handler } = createHandler();
      const conn = new MockConnection();

      performHello(handler, conn);

      handler.handle(conn, {
        type: "join_room",
        roomId: "nonexistent",
      });

      const error = conn.findSentMessage("error");
      expect(error?.code).toBe("room_not_found");
    });

    it("rejects joining with wrong password", () => {
      const { handler } = createHandler();
      const conn1 = new MockConnection("conn-1");
      const conn2 = new MockConnection("conn-2");

      performHello(handler, conn1, "Host");
      performHello(handler, conn2, "Joiner");

      handler.handle(conn1, {
        type: "create_room",
        name: "Locked",
        password: "secret",
        mapId: "arena_standard",
        lifeCount: 2,
        costLimit: 10,
      });

      const roomCreated = conn1.findSentMessage("room_created")!;
      conn2.clearMessages();

      handler.handle(conn2, {
        type: "join_room",
        roomId: roomCreated.roomId,
        password: "wrong",
      });

      const error = conn2.findSentMessage("error");
      expect(error?.code).toBe("wrong_password");
    });

    it("allows joining with correct password", () => {
      const { handler } = createHandler();
      const conn1 = new MockConnection("conn-1");
      const conn2 = new MockConnection("conn-2");

      performHello(handler, conn1, "Host");
      performHello(handler, conn2, "Joiner");

      handler.handle(conn1, {
        type: "create_room",
        name: "Locked",
        password: "secret",
        mapId: "arena_standard",
        lifeCount: 2,
        costLimit: 10,
      });

      const roomCreated = conn1.findSentMessage("room_created")!;
      conn2.clearMessages();

      handler.handle(conn2, {
        type: "join_room",
        roomId: roomCreated.roomId,
        password: "secret",
      });

      const joined = conn2.findSentMessage("room_joined");
      expect(joined).toBeDefined();
    });

    it("rejects joining a full room", () => {
      const { handler } = createHandler();
      const conn1 = new MockConnection("conn-1");
      const conn2 = new MockConnection("conn-2");
      const conn3 = new MockConnection("conn-3");

      performHello(handler, conn1, "P1");
      performHello(handler, conn2, "P2");
      performHello(handler, conn3, "P3");

      handler.handle(conn1, {
        type: "create_room",
        name: "Test",
        mapId: "arena_standard",
        lifeCount: 2,
        costLimit: 10,
      });
      const roomCreated = conn1.findSentMessage("room_created")!;

      handler.handle(conn2, {
        type: "join_room",
        roomId: roomCreated.roomId,
      });
      conn3.clearMessages();

      handler.handle(conn3, {
        type: "join_room",
        roomId: roomCreated.roomId,
      });

      const error = conn3.findSentMessage("error");
      expect(error?.code).toBe("room_full");
    });
  });

  describe("room list", () => {
    it("lists waiting rooms with pagination and locked rooms", () => {
      const { handler } = createHandler();
      const host1 = new MockConnection("host-1");
      const host2 = new MockConnection("host-2");
      const viewer = new MockConnection("viewer");

      performHello(handler, host1, "Alice");
      performHello(handler, host2, "Bob");
      performHello(handler, viewer, "Viewer");

      handler.handle(host1, {
        type: "create_room",
        name: "Open",
        mapId: "arena_standard",
        lifeCount: 2,
        costLimit: 10,
      });
      handler.handle(host2, {
        type: "create_room",
        name: "Locked",
        password: "secret",
        mapId: "arena_standard",
        lifeCount: 2,
        costLimit: 10,
      });

      viewer.clearMessages();
      handler.handle(viewer, { type: "list_rooms", page: 1, pageSize: 1 });

      const list = viewer.findSentMessage("room_list");
      expect(list?.page).toBe(1);
      expect(list?.pageSize).toBe(1);
      expect(list?.total).toBe(2);
      expect(list?.totalPages).toBe(2);
      expect(list?.rooms).toHaveLength(1);
      expect(list?.rooms[0].hostName).toBeDefined();
      expect(typeof list?.rooms[0].hasPassword).toBe("boolean");

      viewer.clearMessages();
      handler.handle(viewer, { type: "list_rooms", page: 1, pageSize: 12 });
      const fullList = viewer.findSentMessage("room_list");
      expect(fullList?.rooms.some((room) => room.hostName === "Bob" && room.hasPassword)).toBe(true);
    });
  });

  describe("quick match", () => {
    it("joins an available room via quick match", () => {
      const { handler } = createHandler();
      const conn1 = new MockConnection("conn-1");
      const conn2 = new MockConnection("conn-2");

      performHello(handler, conn1, "Host");

      handler.handle(conn1, {
        type: "create_room",
        name: "Quick Match Room",
        mapId: "arena_standard",
        lifeCount: 2,
        costLimit: 10,
      });

      performHello(handler, conn2, "Joiner");
      conn2.clearMessages();

      handler.handle(conn2, { type: "quick_match" });

      const joined = conn2.findSentMessage("room_joined");
      expect(joined).toBeDefined();
      expect(joined?.playerId).toBe("Player2");
    });

    it("fails quick match when no rooms available", () => {
      const { handler } = createHandler();
      const conn = new MockConnection();

      performHello(handler, conn);

      handler.handle(conn, { type: "quick_match" });

      const error = conn.findSentMessage("error");
      expect(error?.code).toBe("room_not_found");
    });

    it("fails quick match when already in a room", () => {
      const { handler } = createHandler();
      const conn = new MockConnection();

      performHello(handler, conn);

      handler.handle(conn, {
        type: "create_room",
        name: "My Room",
        mapId: "arena_standard",
        lifeCount: 2,
        costLimit: 10,
      });
      conn.clearMessages();

      handler.handle(conn, { type: "quick_match" });

      const error = conn.findSentMessage("error");
      expect(error?.code).toBe("already_in_room");
    });
  });

  describe("leave room", () => {
    it("allows a player to leave a room", () => {
      const { handler, roomManager } = createHandler();
      const conn = new MockConnection();

      performHello(handler, conn);

      handler.handle(conn, {
        type: "create_room",
        name: "Test",
        mapId: "arena_standard",
        lifeCount: 2,
        costLimit: 10,
      });

      const roomCreated = conn.findSentMessage("room_created")!;
      conn.clearMessages();

      handler.handle(conn, { type: "leave_room" });

      // Room should be deleted (only player left)
      expect(roomManager.get(roomCreated.roomId)).toBeUndefined();
    });

    it("allows leave room when not in a room (no-op)", () => {
      const { handler } = createHandler();
      const conn = new MockConnection();

      performHello(handler, conn);

      // Should silently succeed (no error) — needed when server has already
      // cleaned up the session after the other player left/disconnected
      handler.handle(conn, { type: "leave_room" });

      const error = conn.findSentMessage("error");
      expect(error).toBeUndefined();
    });

    it("keeps the waiting room open when the guest leaves", () => {
      const { handler, roomManager, sessionStore } = createHandler();
      const conn1 = new MockConnection("conn-1");
      const conn2 = new MockConnection("conn-2");

      performHello(handler, conn1, "Host");
      performHello(handler, conn2, "Joiner");

      handler.handle(conn1, {
        type: "create_room",
        name: "Test",
        mapId: "arena_standard",
        lifeCount: 2,
        costLimit: 10,
      });
      const roomCreated = conn1.findSentMessage("room_created")!;

      handler.handle(conn2, { type: "join_room", roomId: roomCreated.roomId });
      conn1.clearMessages();

      handler.handle(conn2, { type: "leave_room" });

      // Host should be notified of peer disconnect and room state change
      const peerStatus = conn1.findSentMessage("peer_status");
      expect(peerStatus).toBeDefined();
      expect(peerStatus?.status).toBe("disconnected");

      const roomState = conn1.findAllSentMessages("room_state").pop();
      expect(roomState?.playerCount).toBe(1);
      expect(roomState?.status).toBe("waiting");
      expect(roomManager.get(roomCreated.roomId)?.connectionIds).toEqual(["conn-1", null]);
      expect(sessionStore.get(conn1.id)?.roomId).toBe(roomCreated.roomId);
      expect(sessionStore.get(conn2.id)?.roomId).toBeNull();
    });

    it("finishes an active battle when a player leaves intentionally", () => {
      const { handler, roomManager } = createHandler();
      const conn1 = new MockConnection("conn-1");
      const conn2 = new MockConnection("conn-2");

      performHello(handler, conn1, "Host");
      performHello(handler, conn2, "Joiner");

      handler.handle(conn1, {
        type: "create_room",
        name: "Active Leave",
        mapId: "arena_standard",
        lifeCount: 2,
        costLimit: 10,
      });
      const roomId = conn1.findSentMessage("room_created")!.roomId;
      handler.handle(conn2, { type: "join_room", roomId });
      handler.handle(conn2, { type: "lobby_ready", ready: true });
      handler.handle(conn1, { type: "start_game" });
      handler.handle(conn1, {
        type: "ready",
        loadout: { primaryCharacterId: "reimu", alternateCharacterId: "marisa", abilityCardIds: [] },
      });
      handler.handle(conn2, {
        type: "ready",
        loadout: { primaryCharacterId: "sakuya", alternateCharacterId: "reimu", abilityCardIds: [] },
      });
      handler.handle(conn1, { type: "loading_done" });
      handler.handle(conn2, { type: "loading_done" });
      conn1.clearMessages();

      handler.handle(conn2, { type: "leave_room" });

      // Room is cleaned up and deleted (remaining player's session is freed)
      expect(roomManager.get(roomId)).toBeUndefined();
      // Final room_state sent before cleanup has "finished" status
      const lastRoomState = conn1.findAllSentMessages("room_state").pop();
      expect(lastRoomState?.status).toBe("finished");
      expect(lastRoomState?.playerCount).toBe(1);
    });

    it("does not carry the previous opponent into a new room after leaving selection", () => {
      const { handler, roomManager, sessionStore } = createHandler();
      const conn1 = new MockConnection("conn-1");
      const conn2 = new MockConnection("conn-2");

      performHello(handler, conn1, "Host");
      performHello(handler, conn2, "Joiner");

      handler.handle(conn1, {
        type: "create_room",
        name: "Selection Leave",
        mapId: "arena_standard",
        lifeCount: 2,
        costLimit: 10,
      });
      const oldRoomId = conn1.findSentMessage("room_created")!.roomId;
      handler.handle(conn2, { type: "join_room", roomId: oldRoomId });
      handler.handle(conn2, { type: "lobby_ready", ready: true });
      handler.handle(conn1, { type: "start_game" });

      handler.handle(conn1, { type: "leave_room" });

      expect(roomManager.get(oldRoomId)).toBeUndefined();
      expect(sessionStore.get(conn1.id)?.roomId).toBeNull();
      expect(sessionStore.get(conn2.id)?.roomId).toBeNull();

      conn1.clearMessages();
      handler.handle(conn1, {
        type: "create_room",
        name: "Fresh Room",
        mapId: "arena_standard",
        lifeCount: 2,
        costLimit: 10,
      });

      const newRoomId = conn1.findSentMessage("room_created")!.roomId;
      const newRoom = roomManager.get(newRoomId);
      expect(newRoom?.connectionIds).toEqual(["conn-1", null]);
      expect(newRoom?.playerSlots).toEqual(["Player1", null]);
      expect(conn1.findAllSentMessages("room_state").pop()?.playerCount).toBe(1);
    });
  });

  describe("ready and battle start", () => {
    function setupTwoPlayerRoom(handler: MessageHandler) {
      const conn1 = new MockConnection("conn-1");
      const conn2 = new MockConnection("conn-2");

      performHello(handler, conn1, "Host");
      performHello(handler, conn2, "Joiner");

      handler.handle(conn1, {
        type: "create_room",
        name: "Battle Ready",
        mapId: "arena_standard",
        lifeCount: 2,
        costLimit: 10,
      });

      const roomCreated = conn1.findSentMessage("room_created")!;

      handler.handle(conn2, { type: "join_room", roomId: roomCreated.roomId });

      // Lobby flow: guest readies then host starts
      handler.handle(conn2, { type: "lobby_ready", ready: true });
      handler.handle(conn1, { type: "start_game" });

      conn1.clearMessages();
      conn2.clearMessages();

      return { conn1, conn2, roomCreated };
    }

    it("sends opponent_ready after first player readies", () => {
      const { handler } = createHandler();
      const { conn1, conn2 } = setupTwoPlayerRoom(handler);

      handler.handle(conn1, {
        type: "ready",
        loadout: {
          primaryCharacterId: "reimu",
          alternateCharacterId: "marisa",
          abilityCardIds: [],
        },
      });

      // conn2 should get opponent_ready
      const opponentReady = conn2.findSentMessage("opponent_ready");
      expect(opponentReady).toBeDefined();

      // conn1 should NOT get battle_start yet
      expect(conn1.findSentMessage("battle_start")).toBeUndefined();
    });

    it("sends battle_start to both players when both ready", () => {
      const { handler } = createHandler();
      const { conn1, conn2 } = setupTwoPlayerRoom(handler);

      handler.handle(conn1, {
        type: "ready",
        loadout: {
          primaryCharacterId: "reimu",
          alternateCharacterId: "marisa",
          abilityCardIds: [],
        },
      });

      handler.handle(conn2, {
        type: "ready",
        loadout: {
          primaryCharacterId: "sakuya",
          alternateCharacterId: "reimu",
          abilityCardIds: [],
        },
      });

      const battle1 = conn1.findSentMessage("battle_start");
      const battle2 = conn2.findSentMessage("battle_start");

      expect(battle1).toBeDefined();
      expect(battle2).toBeDefined();
      expect(battle1?.config.battleId).toBe(battle2?.config.battleId);
      expect(battle1?.config.players).toHaveLength(2);
      expect(battle1?.config.players[0].playerId).toBe("Player1");
      expect(battle1?.config.players[1].playerId).toBe("Player2");
    });

    it("rejects ready when not in a room", () => {
      const { handler } = createHandler();
      const conn = new MockConnection();

      performHello(handler, conn);

      handler.handle(conn, {
        type: "ready",
        loadout: {
          primaryCharacterId: "reimu",
          alternateCharacterId: "marisa",
          abilityCardIds: [],
        },
      });

      const error = conn.findSentMessage("error");
      expect(error?.code).toBe("not_in_room");
    });

    it("rejects invalid loadout", () => {
      const { handler } = createHandler();
      const { conn1 } = setupTwoPlayerRoom(handler);

      handler.handle(conn1, {
        type: "ready",
        loadout: {
          primaryCharacterId: "reimu",
          alternateCharacterId: "reimu", // duplicate characters
          abilityCardIds: [],
        },
      });

      const error = conn1.findSentMessage("error");
      expect(error?.code).toBe("invalid_loadout");
    });
  });

  describe("loading done", () => {
    function setupReadyRoom(handler: MessageHandler) {
      const { conn1, conn2, roomCreated } = setupTwoPlayerRoom(handler);

      handler.handle(conn1, {
        type: "ready",
        loadout: {
          primaryCharacterId: "reimu",
          alternateCharacterId: "marisa",
          abilityCardIds: [],
        },
      });
      handler.handle(conn2, {
        type: "ready",
        loadout: {
          primaryCharacterId: "sakuya",
          alternateCharacterId: "reimu",
          abilityCardIds: [],
        },
      });

      conn1.clearMessages();
      conn2.clearMessages();

      return { conn1, conn2, roomCreated };
    }

    function setupTwoPlayerRoom(handler: MessageHandler) {
      const conn1 = new MockConnection("conn-1");
      const conn2 = new MockConnection("conn-2");

      performHello(handler, conn1, "Host");
      performHello(handler, conn2, "Joiner");

      handler.handle(conn1, {
        type: "create_room",
        name: "Test",
        mapId: "arena_standard",
        lifeCount: 2,
        costLimit: 10,
      });

      const roomCreated = conn1.findSentMessage("room_created")!;
      handler.handle(conn2, { type: "join_room", roomId: roomCreated.roomId });

      // Lobby flow: guest readies then host starts
      handler.handle(conn2, { type: "lobby_ready", ready: true });
      handler.handle(conn1, { type: "start_game" });

      conn1.clearMessages();
      conn2.clearMessages();

      return { conn1, conn2, roomCreated };
    }

    it("transitions to fighting when both players finish loading", () => {
      const { handler } = createHandler();
      const { conn1, conn2 } = setupReadyRoom(handler);

      handler.handle(conn1, { type: "loading_done" });
      handler.handle(conn2, { type: "loading_done" });

      const state1 = conn1.findAllSentMessages("room_state").pop();
      const state2 = conn2.findAllSentMessages("room_state").pop();

      expect(state1?.status).toBe("fighting");
      expect(state2?.status).toBe("fighting");
    });

    it("treats duplicate loading_done after fighting as idempotent", () => {
      const { handler } = createHandler();
      const { conn1, conn2 } = setupReadyRoom(handler);

      handler.handle(conn1, { type: "loading_done" });
      handler.handle(conn2, { type: "loading_done" });
      conn1.clearMessages();

      handler.handle(conn1, { type: "loading_done" });

      expect(conn1.findSentMessage("error")).toBeUndefined();
      expect(conn1.findSentMessage("room_state")?.status).toBe("fighting");
    });

    it("rejects loading_done in wrong state", () => {
      const { handler } = createHandler();
      const conn = new MockConnection();

      performHello(handler, conn);

      handler.handle(conn, { type: "loading_done" });

      const error = conn.findSentMessage("error");
      expect(error?.code).toBe("not_in_room");
    });
  });

  describe("input frame relay", () => {
    function setupFightingRoom(handler: MessageHandler) {
      const conn1 = new MockConnection("conn-1");
      const conn2 = new MockConnection("conn-2");

      performHello(handler, conn1, "P1");
      performHello(handler, conn2, "P2");

      handler.handle(conn1, {
        type: "create_room",
        name: "Fight",
        mapId: "arena_standard",
        lifeCount: 2,
        costLimit: 10,
      });
      const roomCreated = conn1.findSentMessage("room_created")!;
      handler.handle(conn2, { type: "join_room", roomId: roomCreated.roomId });

      // Lobby flow: guest readies, host starts game
      handler.handle(conn2, { type: "lobby_ready", ready: true });
      handler.handle(conn1, { type: "start_game" });

      handler.handle(conn1, {
        type: "ready",
        loadout: { primaryCharacterId: "reimu", alternateCharacterId: "marisa", abilityCardIds: [] },
      });
      handler.handle(conn2, {
        type: "ready",
        loadout: { primaryCharacterId: "sakuya", alternateCharacterId: "reimu", abilityCardIds: [] },
      });

      handler.handle(conn1, { type: "loading_done" });
      handler.handle(conn2, { type: "loading_done" });

      conn1.clearMessages();
      conn2.clearMessages();

      return { conn1, conn2, roomCreated };
    }

    it("relays input from one player to the other", () => {
      const { handler, roomManager } = createHandler();
      const { conn1, conn2 } = setupFightingRoom(handler);
      const roomId = conn1.findSentMessage("room_joined")?.roomId
        ?? roomManager.getAllRooms()[0]!.id;

      handler.handle(conn1, {
        type: "input_frame",
        frame: 1,
        ackFrame: 7,
        moveX: 1,
        moveY: 0,
        aimX: 100,
        aimY: 200,
        shootPressed: true,
        bombPressed: false,
        activeCardPressed: false,
        reloadPressed: false,
        alternateHeld: false,
        infoHeld: false,
      });

      const relayed = conn2.findSentMessage("input_frame");
      expect(relayed).toBeDefined();
      expect(relayed?.playerId).toBe("Player1");
      expect(relayed?.frame).toBe(1);
      expect(relayed?.ackFrame).toBe(7);
      expect(relayed?.moveX).toBe(1);
      expect(relayed?.shootPressed).toBe(true);
      expect(roomManager.get(roomId)?.lastAckFrameIds[0]).toBe(7);
    });

    it("does not relay input back to the sender", () => {
      const { handler } = createHandler();
      const { conn1 } = setupFightingRoom(handler);

      handler.handle(conn1, {
        type: "input_frame",
        frame: 5,
        ackFrame: 0,
        moveX: 0,
        moveY: 1,
        aimX: 0,
        aimY: 0,
        shootPressed: false,
        bombPressed: false,
        activeCardPressed: false,
        reloadPressed: false,
        alternateHeld: false,
        infoHeld: false,
      });

      // conn1 should not get its own input back
      const relayed = conn1.findSentMessage("input_frame");
      expect(relayed).toBeUndefined();
    });

    it("drops input when not in fighting state", () => {
      const { handler } = createHandler();
      const conn1 = new MockConnection("conn-1");
      const conn2 = new MockConnection("conn-2");

      performHello(handler, conn1, "P1");
      performHello(handler, conn2, "P2");

      handler.handle(conn1, {
        type: "create_room",
        name: "Test",
        mapId: "arena_standard",
        lifeCount: 2,
        costLimit: 10,
      });
      const roomCreated = conn1.findSentMessage("room_created")!;
      handler.handle(conn2, { type: "join_room", roomId: roomCreated.roomId });

      conn1.clearMessages();
      conn2.clearMessages();

      // Send input while room is in "selecting" state
      handler.handle(conn1, {
        type: "input_frame",
        frame: 1,
        ackFrame: 0,
        moveX: 0,
        moveY: 0,
        aimX: 0,
        aimY: 0,
        shootPressed: false,
        bombPressed: false,
        activeCardPressed: false,
        reloadPressed: false,
        alternateHeld: false,
        infoHeld: false,
      });

      // No relay should happen
      const relayed = conn2.findSentMessage("input_frame");
      expect(relayed).toBeUndefined();
    });
  });

  describe("game over verdicts", () => {
    function setupFightingRoom(handler: MessageHandler) {
      const conn1 = new MockConnection("conn-1");
      const conn2 = new MockConnection("conn-2");

      performHello(handler, conn1, "P1");
      performHello(handler, conn2, "P2");

      handler.handle(conn1, {
        type: "create_room",
        name: "Verdict Fight",
        mapId: "arena_standard",
        lifeCount: 2,
        costLimit: 10,
      });
      const roomId = conn1.findSentMessage("room_created")!.roomId;
      handler.handle(conn2, { type: "join_room", roomId });
      handler.handle(conn2, { type: "lobby_ready", ready: true });
      handler.handle(conn1, { type: "start_game" });
      handler.handle(conn1, {
        type: "ready",
        loadout: { primaryCharacterId: "reimu", alternateCharacterId: "marisa", abilityCardIds: [] },
      });
      handler.handle(conn2, {
        type: "ready",
        loadout: { primaryCharacterId: "sakuya", alternateCharacterId: "reimu", abilityCardIds: [] },
      });
      handler.handle(conn1, { type: "loading_done" });
      handler.handle(conn2, { type: "loading_done" });
      conn1.clearMessages();
      conn2.clearMessages();
      return { conn1, conn2, roomId };
    }

    it("waits for both players before broadcasting battle_finished", () => {
      const { handler, roomManager } = createHandler();
      const { conn1, conn2, roomId } = setupFightingRoom(handler);

      handler.handle(conn1, {
        type: "game_over",
        frame: 120,
        ackFrame: 120,
        winnerPlayerId: "Player1",
      });

      expect(conn1.findSentMessage("battle_finished")).toBeUndefined();
      expect(conn2.findSentMessage("battle_finished")).toBeUndefined();
      expect(conn2.findSentMessage("peer_game_over")).toMatchObject({
        playerId: "Player1",
        frame: 120,
        ackFrame: 120,
        winnerPlayerId: "Player1",
      });
      expect(roomManager.get(roomId)?.status).toBe("fighting");

      handler.handle(conn2, {
        type: "game_over",
        frame: 122,
        ackFrame: 122,
        winnerPlayerId: "Player1",
      });

      expect(conn1.findSentMessage("battle_finished")?.winnerPlayerId).toBe("Player1");
      expect(conn2.findSentMessage("battle_finished")?.frame).toBe(122);
      expect(conn2.findSentMessage("battle_finished")?.confirmedFrame).toBe(120);
      // Room is cleaned up after both verdicts (players freed for new rooms)
      expect(roomManager.get(roomId)).toBeUndefined();
      // Final room_state sent before cleanup has "finished" status
      const p1RoomState = conn1.findAllSentMessages("room_state").pop();
      expect(p1RoomState?.status).toBe("finished");
    });

    it("does not confirm frames beyond a client that already stopped at local game over", () => {
      const { handler } = createHandler();
      const { conn1, conn2 } = setupFightingRoom(handler);

      handler.handle(conn1, {
        type: "game_over",
        frame: 2392,
        ackFrame: 2394,
        winnerPlayerId: "Player2",
      });
      handler.handle(conn2, {
        type: "game_over",
        frame: 2394,
        ackFrame: 2392,
        winnerPlayerId: "Player2",
      });

      expect(conn1.findSentMessage("battle_finished")?.frame).toBe(2394);
      expect(conn1.findSentMessage("battle_finished")?.confirmedFrame).toBe(2392);
      expect(conn2.findSentMessage("battle_finished")?.confirmedFrame).toBe(2392);
    });

    it("does not finish when the two verdicts disagree", () => {
      const { handler, roomManager } = createHandler();
      const { conn1, conn2, roomId } = setupFightingRoom(handler);

      handler.handle(conn1, {
        type: "game_over",
        frame: 120,
        ackFrame: 120,
        winnerPlayerId: "Player1",
      });
      handler.handle(conn2, {
        type: "game_over",
        frame: 120,
        ackFrame: 120,
        winnerPlayerId: "Player2",
      });

      expect(conn1.findSentMessage("battle_finished")).toBeUndefined();
      expect(conn2.findSentMessage("battle_finished")).toBeUndefined();
      expect(roomManager.get(roomId)?.status).toBe("fighting");
    });
  });

  describe("ping/pong", () => {
    it("responds to ping with pong", () => {
      const { handler } = createHandler();
      const conn = new MockConnection();

      performHello(handler, conn);
      conn.clearMessages();

      handler.handle(conn, { type: "ping", seq: 42 });

      const pong = conn.findSentMessage("pong");
      expect(pong?.seq).toBe(42);
    });
  });

  describe("disconnect", () => {
    it("cleans up session and room on disconnect", () => {
      const { handler, sessionStore, roomManager } = createHandler();
      const conn = new MockConnection();

      performHello(handler, conn);

      handler.handle(conn, {
        type: "create_room",
        name: "Test",
        mapId: "arena_standard",
        lifeCount: 2,
        costLimit: 10,
      });

      const roomCreated = conn.findSentMessage("room_created")!;

      handler.handleDisconnect(conn.id);

      expect(sessionStore.get(conn.id)).toBeUndefined();
      expect(roomManager.get(roomCreated.roomId)).toBeUndefined();
    });

    it("keeps the waiting room open when the guest disconnects", () => {
      const { handler, roomManager, sessionStore } = createHandler();
      const conn1 = new MockConnection("conn-1");
      const conn2 = new MockConnection("conn-2");

      performHello(handler, conn1, "P1");
      performHello(handler, conn2, "P2");

      handler.handle(conn1, {
        type: "create_room",
        name: "Test",
        mapId: "arena_standard",
        lifeCount: 2,
        costLimit: 10,
      });
      const roomCreated = conn1.findSentMessage("room_created")!;
      handler.handle(conn2, { type: "join_room", roomId: roomCreated.roomId });

      conn1.clearMessages();

      // Player 2 disconnects
      handler.handleDisconnect(conn2.id);

      // Player 1 should get notified
      const peerStatus = conn1.findSentMessage("peer_status");
      expect(peerStatus).toBeDefined();
      expect(peerStatus?.playerId).toBe("Player2");
      expect(peerStatus?.status).toBe("disconnected");

      expect(roomManager.get(roomCreated.roomId)?.connectionIds).toEqual(["conn-1", null]);
      expect(sessionStore.get(conn1.id)?.roomId).toBe(roomCreated.roomId);
      expect(sessionStore.get(conn2.id)).toBeUndefined();
    });

    it("lets a fighting player reconnect to the same slot during the 1s grace window", () => {
      const { handler, roomManager } = createHandler();
      const conn1 = new MockConnection("conn-1");
      const conn2 = new MockConnection("conn-2");

      performHello(handler, conn1, "P1");
      performHello(handler, conn2, "P2");

      handler.handle(conn1, {
        type: "create_room",
        name: "Reconnect Fight",
        mapId: "arena_standard",
        lifeCount: 2,
        costLimit: 10,
      });
      const roomId = conn1.findSentMessage("room_created")!.roomId;
      handler.handle(conn2, { type: "join_room", roomId });
      handler.handle(conn2, { type: "lobby_ready", ready: true });
      handler.handle(conn1, { type: "start_game" });
      handler.handle(conn1, {
        type: "ready",
        loadout: { primaryCharacterId: "reimu", alternateCharacterId: "marisa", abilityCardIds: [] },
      });
      handler.handle(conn2, {
        type: "ready",
        loadout: { primaryCharacterId: "sakuya", alternateCharacterId: "reimu", abilityCardIds: [] },
      });
      handler.handle(conn1, { type: "loading_done" });
      handler.handle(conn2, { type: "loading_done" });

      const room = roomManager.get(roomId)!;
      const battleId = room.battleId!;
      conn1.clearMessages();

      handler.handleDisconnect(conn2.id);
      expect(conn1.findSentMessage("peer_status")?.status).toBe("disconnected");
      expect(room.connectionIds[1]).toBeNull();
      expect(room.playerSlots[1]).toBe("Player2");

      const reconnect = new MockConnection("conn-2b");
      handler.registerConnection(reconnect);
      handler.handle(reconnect, {
        type: "hello",
        username: "P2",
        clientVersion: "1.0.0",
        debug: false,
        reconnect: { roomId, playerId: "Player2", battleId },
      });

      expect(room.connectionIds[1]).toBe("conn-2b");
      expect(room.status).toBe("fighting");
      expect(reconnect.findSentMessage("battle_start")?.config.battleId).toBe(battleId);
      expect(conn1.findAllSentMessages("peer_status").pop()?.status).toBe("reconnected");
    });
  });
});
