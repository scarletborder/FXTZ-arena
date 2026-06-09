import { describe, expect, it } from "vitest";
import type { BattleInputState } from "@repo/types";

import { finalReplayInputHash } from "./input-hash";
import type { ReplayFrame } from "./types";

const idleInput: BattleInputState = {
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

describe("finalReplayInputHash", () => {
  it("builds a stable final hash from recorded replay inputs", () => {
    const frames = [
      createFrame(1),
      createFrame(2, { shootPressed: true }),
      createFrame(3, { moveX: 1, aimX: 700 }),
    ];

    expect(finalReplayInputHash(frames)).toMatch(/^[0-9a-f]{64}$/);
    expect(finalReplayInputHash(frames)).toBe(finalReplayInputHash(frames));
  });

  it("returns null for non-monotonic replay frame order", () => {
    expect(finalReplayInputHash([
      createFrame(2),
      createFrame(1),
    ])).toBeNull();
  });
});

function createFrame(
  frame: number,
  player1: Partial<BattleInputState> = {},
): ReplayFrame {
  return {
    frame,
    player1: { ...idleInput, ...player1 },
    player2: idleInput,
  };
}
