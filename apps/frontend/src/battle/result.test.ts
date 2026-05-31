import { describe, expect, it } from "vitest";

import { resolveResultWinnerName } from "./result";

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