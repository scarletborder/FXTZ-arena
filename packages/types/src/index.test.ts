import { describe, expect, it } from "vitest";

import {
  ARENA_WIDTH,
  DEFAULT_BOMBS,
  DEFAULT_LIVES,
  HIT_CIRCLE_DIAMETER,
  bulletSpeedRankToPixelsPerTick,
  getDefaultBombs,
  getInitialLives,
  hitCircleUnits,
  secondsToTicks,
  speedRankToPixelsPerTick,
  type PlayerLoadout,
} from "./index";

describe("@repo/types default battle rules", () => {
  it("uses default lives and bombs without passive cards", () => {
    const loadout: PlayerLoadout = {
      primaryCharacterId: "reimu",
      alternateCharacterId: "sakuya",
      abilityCardIds: [],
    };

    expect(getInitialLives(loadout)).toBe(DEFAULT_LIVES);
    expect(getDefaultBombs(loadout)).toBe(DEFAULT_BOMBS);
  });

  it("applies passive cards that change initial lives and bombs", () => {
    const loadout: PlayerLoadout = {
      primaryCharacterId: "reimu",
      alternateCharacterId: "sakuya",
      abilityCardIds: ["extra_life", "ember"],
    };

    expect(getInitialLives(loadout)).toBe(4); // 3渲染为2心，4渲染为3心
    expect(getDefaultBombs(loadout)).toBe(4);
  });
});

describe("@repo/types unit conversions", () => {
  it("converts seconds to 60 fps ticks", () => {
    expect(secondsToTicks(1)).toBe(60);
    expect(secondsToTicks(1.5)).toBe(90);
    expect(secondsToTicks(20)).toBe(1200);
  });

  it("converts speed ranks", () => {
    expect(speedRankToPixelsPerTick("low")).toBe(2);
    expect(speedRankToPixelsPerTick("medium")).toBe(4);
    expect(speedRankToPixelsPerTick("high")).toBe(5);
    expect(bulletSpeedRankToPixelsPerTick("low")).toBeCloseTo(ARENA_WIDTH / 360);
  });

  it("converts hit circle diameter multipliers", () => {
    expect(hitCircleUnits(4)).toBe(HIT_CIRCLE_DIAMETER * 4);
  });
});
