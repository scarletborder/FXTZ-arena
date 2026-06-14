import { describe, expect, it } from "vitest";

import {
  resolveDisplayedBattleResult,
  resolveResultWinnerName,
  resolveWinnerPlayerId,
} from "./utils/result";

describe("resolveResultWinnerName", () => {
  it("uses deaths rather than lives for offline battle results", () => {
    expect(
      resolveResultWinnerName({
        winnerPlayerId: null,
        localPlayerId: null,
        localPlayerName: "玩家",
        opponentName: "CPU",
        playerDeaths: 0,
        targetDeaths: 1,
      }),
    ).toBe("玩家");

    expect(
      resolveResultWinnerName({
        winnerPlayerId: null,
        localPlayerId: null,
        localPlayerName: "玩家",
        opponentName: "CPU",
        playerDeaths: 1,
        targetDeaths: 0,
      }),
    ).toBe("CPU");
  });
});

describe("resolveWinnerPlayerId", () => {
  it("keeps the winner as a player slot even when display names match", () => {
    expect(
      resolveWinnerPlayerId({
        winnerPlayerId: "Player2",
        localPlayerId: "Player1",
        playerDeaths: 0,
        targetDeaths: 0,
      }),
    ).toBe("Player2");
  });

  it("derives offline winner slot from deaths", () => {
    expect(
      resolveWinnerPlayerId({
        winnerPlayerId: null,
        localPlayerId: "Player1",
        playerDeaths: 1,
        targetDeaths: 0,
      }),
    ).toBe("Player2");
  });
});

describe("resolveDisplayedBattleResult", () => {
  it("restores collaborate verdict slots to challenge results", () => {
    expect(
      resolveDisplayedBattleResult({
        battleResult: "running",
        battleMode: "collaborate",
        winnerPlayerId: "Player1",
      }),
    ).toBe("collaborate_victory");

    expect(
      resolveDisplayedBattleResult({
        battleResult: "running",
        battleMode: "collaborate",
        winnerPlayerId: "Player2",
      }),
    ).toBe("collaborate_defeat");
  });

  it("does not reinterpret versus winner slots as collaborate results", () => {
    expect(
      resolveDisplayedBattleResult({
        battleResult: "versus_player1",
        battleMode: "versus",
        winnerPlayerId: "Player1",
      }),
    ).toBe("versus_player1");
  });
});
