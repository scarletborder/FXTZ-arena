import { describe, expect, it, vi } from "vitest";

vi.mock("phaser", () => ({
  default: {
    Input: {
      Keyboard: {
        JustDown: (key: { _justDown?: boolean }) => {
          const justDown = key._justDown === true;
          key._justDown = false;
          return justDown;
        },
      },
    },
    Math: {
      Clamp: (value: number, min: number, max: number) =>
        Math.max(min, Math.min(max, value)),
    },
  },
}));

import { createBattleInput, type BattleKeyMap } from "./input";
import type { BattleMobileControls } from "./mobile-controls";

describe("createBattleInput", () => {
  it("truncates mobile aim coordinates before building logic input", () => {
    const input = createBattleInput(
      createSceneStub(),
      createKeys(),
      {
        readState: () => ({
          moveX: 0,
          moveY: 0,
          aimX: 312.9,
          aimY: 456.8,
          shootPressed: false,
          bombPressed: false,
          activeCardPressed: false,
          reloadPressed: false,
          alternateHeld: false,
        }),
        aimWorld: () => ({ x: 312.9, y: 456.8 }),
      } as BattleMobileControls,
    );

    expect(input.aimX).toBe(312);
    expect(input.aimY).toBe(456);
  });
});

function createSceneStub() {
  const pointer = {
    x: 0,
    y: 0,
    leftButtonDown: () => false,
    rightButtonDown: () => false,
    positionToCamera: () => ({ x: 0, y: 0 }),
  };
  return {
    input: { activePointer: pointer },
    cameras: { main: {} },
  } as never;
}

function createKeys(): BattleKeyMap {
  const key = { isDown: false };
  return {
    w: key,
    a: key,
    s: key,
    d: key,
    shift: key,
    r: key,
    tab: key,
    enter: key,
    e: key,
  } as unknown as BattleKeyMap;
}
