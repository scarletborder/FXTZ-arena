import { describe, it, expect, beforeEach } from "vitest";

import { DEFAULT_SERVER_CONFIG } from "../config";
import { MessageHandler } from "../protocol/handler";
import { RoomLifecycle } from "../room/lifecycle";
import { RoomManager } from "../room/manager";
import { SessionStore } from "../session/store";
import { MockConnection } from "./test-utils";

/**
 * Full lifecycle integration test:
 * Simulates two real clients going through the entire flow.
 */

interface TestClient {
  conn: MockConnection;
  username: string;
  sentMessages(): number;
}

function createServer() {
  const sessionStore = new SessionStore();
  const roomManager = new RoomManager();
  const roomLifecycle = new RoomLifecycle();
  const handler = new MessageHandler(
    sessionStore,
    roomManager,
    roomLifecycle,
    DEFAULT_SERVER_CONFIG,
  );
  // Register connections
  handler.registerConnection(new MockConnection("conn-1"));
  handler.registerConnection(new MockConnection("conn-2"));
  return { sessionStore, roomManager, handler };
}

describe("Full Game Lifecycle Integration", () => {
  it("completes the full room lifecycle: create → join → ready → load → fight", () => {
    const { handler } = createServer();

    // ─── Step 1: Both clients say hello ─────────────────────
    const p1 = new MockConnection("conn-1");
    handler.registerConnection(p1);
    handler.handle(p1, { type: "hello", username: "Alice", clientVersion: "1.0.0", debug: false });

    const p2 = new MockConnection("conn-2");
    handler.registerConnection(p2);
    handler.handle(p2, { type: "hello", username: "Bob", clientVersion: "1.0.0", debug: false });

    // Both get server_hello
    expect(p1.findSentMessage("server_hello")).toBeDefined();
    expect(p2.findSentMessage("server_hello")).toBeDefined();

    p1.clearMessages();
    p2.clearMessages();

    // ─── Step 2: P1 creates a room ──────────────────────────
    handler.handle(p1, {
      type: "create_room",
      name: "Alice's Battle",
      mapId: "arena_standard",
      lifeCount: 3,
      costLimit: 12,
    });

    const roomCreated = p1.findSentMessage("room_created");
    expect(roomCreated).toBeDefined();
    const roomId = roomCreated!.roomId;

    expect(p1.findSentMessage("room_joined")).toBeDefined();
    expect(p1.findSentMessage("room_state")).toBeDefined();

    const p1State = p1.findSentMessage("room_state");
    expect(p1State?.playerCount).toBe(1);
    expect(p1State?.status).toBe("waiting");

    p1.clearMessages();
    p2.clearMessages();

    // ─── Step 3: P2 joins the room ──────────────────────────
    handler.handle(p2, {
      type: "join_room",
      roomId,
    });

    const joined = p2.findSentMessage("room_joined");
    expect(joined?.playerId).toBe("player-2");

    const p2State = p2.findSentMessage("room_state");
    expect(p2State?.playerCount).toBe(2);
    expect(p2State?.status).toBe("selecting");

    // P1 should be notified
    const p1StateUpdated = p1.findSentMessage("room_state");
    expect(p1StateUpdated).toBeDefined();
    expect(p1StateUpdated?.playerCount).toBe(2);
    expect(p1StateUpdated?.status).toBe("selecting");
    expect(p1StateUpdated?.opponentUsername).toBe("Bob");

    p1.clearMessages();
    p2.clearMessages();

    // ─── Step 4: P1 readies up ──────────────────────────────
    handler.handle(p1, {
      type: "ready",
      loadout: {
        primaryCharacterId: "reimu",
        alternateCharacterId: "marisa",
        abilityCardIds: [],
      },
    });

    // P2 gets opponent_ready notification
    const oppReady = p2.findSentMessage("opponent_ready");
    expect(oppReady).toBeDefined();

    // Battle should NOT start yet
    expect(p1.findSentMessage("battle_start")).toBeUndefined();
    expect(p2.findSentMessage("battle_start")).toBeUndefined();

    p1.clearMessages();
    p2.clearMessages();

    // ─── Step 5: P2 readies up ──────────────────────────────
    handler.handle(p2, {
      type: "ready",
      loadout: {
        primaryCharacterId: "sakuya",
        alternateCharacterId: "reimu",
        abilityCardIds: [],
      },
    });

    // Both get battle_start
    const p1Battle = p1.findSentMessage("battle_start");
    const p2Battle = p2.findSentMessage("battle_start");
    expect(p1Battle).toBeDefined();
    expect(p2Battle).toBeDefined();

    // Verify battle config
    const config = p1Battle!.config;
    expect(config.battleId).toBe(p2Battle!.config.battleId);
    expect(config.mapId).toBe("arena_standard");
    expect(config.seed).toBeGreaterThanOrEqual(0);
    expect(config.fps).toBe(60);
    expect(config.lifeCount).toBe(3);
    expect(config.costLimit).toBe(12);
    expect(config.players).toHaveLength(2);
    expect(config.players[0].loadout.primaryCharacterId).toBe("reimu");
    expect(config.players[1].loadout.primaryCharacterId).toBe("sakuya");

    p1.clearMessages();
    p2.clearMessages();

    // ─── Step 6: Both finish loading ────────────────────────
    handler.handle(p1, { type: "loading_done" });
    handler.handle(p2, { type: "loading_done" });

    // Both get fighting state
    const p1Final = p1.findAllSentMessages("room_state").pop();
    const p2Final = p2.findAllSentMessages("room_state").pop();
    expect(p1Final?.status).toBe("fighting");
    expect(p2Final?.status).toBe("fighting");

    p1.clearMessages();
    p2.clearMessages();

    // ─── Step 7: Input relay during fight ───────────────────
    handler.handle(p1, {
      type: "input_frame",
      frame: 1,
      moveX: 1,
      moveY: 0,
      aimX: 500,
      aimY: 300,
      shootPressed: true,
      bombPressed: false,
      activeCardPressed: false,
      reloadPressed: false,
      alternateHeld: false,
      infoHeld: false,
    });

    const p2Input = p2.findSentMessage("input_frame");
    expect(p2Input).toBeDefined();
    expect(p2Input?.playerId).toBe("player-1");
    expect(p2Input?.shootPressed).toBe(true);

    handler.handle(p2, {
      type: "input_frame",
      frame: 1,
      moveX: -1,
      moveY: 0,
      aimX: 100,
      aimY: 200,
      shootPressed: false,
      bombPressed: true,
      activeCardPressed: false,
      reloadPressed: false,
      alternateHeld: false,
      infoHeld: false,
    });

    const p1Input = p1.findSentMessage("input_frame");
    expect(p1Input).toBeDefined();
    expect(p1Input?.playerId).toBe("player-2");
    expect(p1Input?.bombPressed).toBe(true);
  });

  it("handles a player disconnecting mid-game", () => {
    const { handler } = createServer();

    const p1 = new MockConnection("conn-1");
    handler.registerConnection(p1);
    handler.handle(p1, { type: "hello", username: "Alice", clientVersion: "1.0.0", debug: false });

    const p2 = new MockConnection("conn-2");
    handler.registerConnection(p2);
    handler.handle(p2, { type: "hello", username: "Bob", clientVersion: "1.0.0", debug: false });

    // Create room
    handler.handle(p1, {
      type: "create_room",
      name: "Test",
      mapId: "arena_standard",
      lifeCount: 2,
      costLimit: 10,
    });
    const roomId = p1.findSentMessage("room_created")!.roomId;

    // Join
    handler.handle(p2, { type: "join_room", roomId });
    p1.clearMessages();

    // P2 disconnects
    handler.handleDisconnect(p2.id);

    // P1 should get disconnect notification
    const peerStatus = p1.findSentMessage("peer_status");
    expect(peerStatus?.playerId).toBe("player-2");
    expect(peerStatus?.status).toBe("disconnected");

    // Room should still exist (P1 is still there)
    // We can verify by checking that P1 can still interact
    p1.clearMessages();
    handler.handle(p1, { type: "leave_room" });
    // P1 should be able to leave (no error)
    const error = p1.findSentMessage("error");
    expect(error).toBeUndefined();
  });

  it("rejects a third player from joining a full room during quick match", () => {
    const { handler } = createServer();

    const p1 = new MockConnection("conn-1");
    const p2 = new MockConnection("conn-2");
    const p3 = new MockConnection("conn-3");

    handler.registerConnection(p1);
    handler.registerConnection(p2);
    handler.registerConnection(p3);

    handler.handle(p1, { type: "hello", username: "P1", clientVersion: "1.0.0", debug: false });
    handler.handle(p2, { type: "hello", username: "P2", clientVersion: "1.0.0", debug: false });
    handler.handle(p3, { type: "hello", username: "P3", clientVersion: "1.0.0", debug: false });

    // P1 creates room
    handler.handle(p1, {
      type: "create_room",
      name: "Full Room",
      mapId: "arena_standard",
      lifeCount: 2,
      costLimit: 10,
    });
    const roomId = p1.findSentMessage("room_created")!.roomId;

    // P2 joins
    handler.handle(p2, { type: "join_room", roomId });
    p3.clearMessages();

    // P3 tries quick match — no rooms available (the only room is now full)
    handler.handle(p3, { type: "quick_match" });
    const error = p3.findSentMessage("error");
    expect(error?.code).toBe("room_not_found");
  });
});
