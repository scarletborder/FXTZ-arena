import { describe, it, expect } from "vitest";

import { RoomLifecycle } from "../room/lifecycle";
import type { PlayerLoadout } from "@repo/types";

import type { InternalRoom } from "../room/types";

function createTestRoom(overrides?: Partial<InternalRoom>): InternalRoom {
  return {
    id: "test-001",
    name: "Test Room",
    password: null,
    mapId: "hakurei_shrine",
    lifeCount: 2,
    costLimit: 10,
    allowSpectators: true,
    status: "selecting",
    connectionIds: ["conn-1", "conn-2"],
    playerSlots: ["Player1", "Player2"],
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
    ...overrides,
  };
}

const sampleLoadout: PlayerLoadout = {
  primaryCharacterId: "reimu",
  alternateCharacterId: "marisa",
  abilityCardIds: [],
};

describe("RoomLifecycle", () => {
  describe("setReady", () => {
    it("records loadout and returns bothReady=false for first player", () => {
      const lifecycle = new RoomLifecycle();
      const room = createTestRoom();

      const result = lifecycle.setReady(room, "Player1", sampleLoadout);

      expect(result.bothReady).toBe(false);
      expect(room.loadouts[0]).toEqual(sampleLoadout);
      expect(room.loadouts[1]).toBeNull();
      expect(room.status).toBe("selecting");
    });

    it("transitions to loading and returns battleConfig when both ready", () => {
      const lifecycle = new RoomLifecycle();
      const room = createTestRoom();

      lifecycle.setReady(room, "Player1", sampleLoadout);
      const result = lifecycle.setReady(room, "Player2", sampleLoadout);

      expect(result.bothReady).toBe(true);
      expect(room.status).toBe("loading");
      expect(room.battleId).toBeDefined();
      expect(room.seed).toBeGreaterThanOrEqual(0);

      if (result.bothReady) {
        expect(result.battleConfig.mapId).toBe("hakurei_shrine");
        expect(result.battleConfig.players).toHaveLength(2);
        expect(result.battleConfig.players[0].playerId).toBe("Player1");
        expect(result.battleConfig.players[1].playerId).toBe("Player2");
        expect(result.battleConfig.fps).toBe(60);
        expect(result.battleConfig.lifeCount).toBe(2);
        expect(result.battleConfig.costLimit).toBe(10);
      }
    });

    it("throws when player is not in the room", () => {
      const lifecycle = new RoomLifecycle();
      const room = createTestRoom();

      expect(() => lifecycle.setReady(room, "Player1", sampleLoadout)).not.toThrow();
      expect(() => lifecycle.setReady(room, "nonexistent" as any, sampleLoadout)).toThrow(
        "Player nonexistent is not in this room",
      );
    });
  });

  describe("setLoadingDone", () => {
    it("records loading done and returns false for first player", () => {
      const lifecycle = new RoomLifecycle();
      const room = createTestRoom({ status: "loading" });

      const result = lifecycle.setLoadingDone(room, "Player1");

      expect(result).toBe(false);
      expect(room.loadingDone[0]).toBe(true);
      expect(room.loadingDone[1]).toBe(false);
      expect(room.status).toBe("loading");
    });

    it("transitions to fighting when both players loaded", () => {
      const lifecycle = new RoomLifecycle();
      const room = createTestRoom({ status: "loading" });

      lifecycle.setLoadingDone(room, "Player1");
      const result = lifecycle.setLoadingDone(room, "Player2");

      expect(result).toBe(true);
      expect(room.status).toBe("fighting");
    });

    it("throws when player is not in the room", () => {
      const lifecycle = new RoomLifecycle();
      const room = createTestRoom({ status: "loading" });

      expect(() => lifecycle.setLoadingDone(room, "nonexistent" as any)).toThrow(
        "Player nonexistent is not in this room",
      );
    });
  });

  describe("setFinished", () => {
    it("transitions room to finished status", () => {
      const lifecycle = new RoomLifecycle();
      const room = createTestRoom({ status: "fighting" });

      lifecycle.setFinished(room);

      expect(room.status).toBe("finished");
    });
  });
});
