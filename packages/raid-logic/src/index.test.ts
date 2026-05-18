import { describe, expect, it } from "vitest";

import { createInitialState, runFixedTickExample } from "./index";

describe("@repo/raid-logic", () => {
  it("runs a deterministic fixed tick example", () => {
    expect(runFixedTickExample(3)).toEqual({
      frame: 3,
      fighters: [
        { playerId: "player-1", x: -108, y: 0 },
        { playerId: "player-2", x: 120, y: 0 },
      ],
    });
  });

  it("creates a stable initial state", () => {
    expect(createInitialState().frame).toBe(0);
  });
});
