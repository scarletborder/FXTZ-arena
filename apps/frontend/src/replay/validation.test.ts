import { describe, expect, it } from "vitest";

import { validateReplayJson } from "./validation";

describe("validateReplayJson", () => {
  it("accepts Player1 or Player2 winner ids", () => {
    expect(validateReplayJson(createReplay({ winnerPlayerId: "Player1" }))?.winnerPlayerId).toBe("Player1");
    expect(validateReplayJson(createReplay({ winnerPlayerId: "Player2" }))?.winnerPlayerId).toBe("Player2");
  });

  it("rejects invalid winner ids", () => {
    expect(validateReplayJson(createReplay({ winnerPlayerId: "same-name-player" }))).toBeNull();
  });

  it("validates per-battle winner ids", () => {
    const replay = createReplay();
    const battle = (replay as { battles: Array<Record<string, unknown>> }).battles[0]!;

    battle.winnerPlayerId = "Player2";
    expect(validateReplayJson(replay)?.battles[0]?.winnerPlayerId).toBe("Player2");

    battle.winnerPlayerId = "same-name-player";
    expect(validateReplayJson(replay)).toBeNull();
  });
});

function createReplay(extra: Record<string, unknown> = {}): unknown {
  return {
    version: 1,
    title: "Replay",
    timestamp: Date.now(),
    mode: "ai",
    player1Id: "SameName",
    player2Id: "SameName",
    finalGlobalInputHash: "hash",
    loadouts: {
      player: { primaryCharacterId: "reimu", alternateCharacterId: "marisa" },
      target: { primaryCharacterId: "sakuya", alternateCharacterId: "cirno" },
    },
    battles: [
      {
        inputs: [
          {
            frame: 1,
            player1: input(),
            player2: input(),
          },
        ],
        playerName: "SameName",
        opponentName: "SameName",
        mapId: "hakurei_shrine",
        playerInitPoint: 0,
        opponentInitPoint: 0,
      },
    ],
    ...extra,
  };
}

function input(): Record<string, unknown> {
  return {
    moveX: 0,
    moveY: 0,
    aimX: 640,
    aimY: 360,
    shootPressed: false,
    bombPressed: false,
    activeCardPressed: false,
    reloadPressed: false,
    alternateHeld: false,
    infoHeld: false,
  };
}
