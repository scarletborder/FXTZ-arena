import { describe, expect, it } from "vitest";

import {
  ARENA_WIDTH,
  DEFAULT_BOMBS,
  DEFAULT_COST_LIMIT,
  DEFAULT_LIVES,
  HIT_CIRCLE_DIAMETER,
  calculateLoadoutCost,
  bulletSpeedRankToPixelsPerTick,
  getDefaultBombs,
  getInitialLives,
  hitCircleUnits,
  secondsToTicks,
  speedRankToPixelsPerTick,
  validateLoadout,
  type PlayerLoadout,
} from "./index";
import { DEFAULT_ABILITY_CARDS, DEFAULT_CHARACTERS } from "@repo/content";

describe("@repo/types static content", () => {
  it("exports the baseline characters", () => {
    expect(DEFAULT_CHARACTERS).toMatchObject([
      {
        id: "reimu",
        name: "博丽灵梦",
        cost: 4,
        ammoCapacity: 5,
        reloadTicksPerAmmo: 48,
        reloadStartPolicy: "keep_current",
        reloadCommitPolicy: "commit_per_ammo",
      },
      {
        id: "marisa",
        name: "魔理沙",
        cost: 5,
        ammoCapacity: 2,
        reloadTicksPerAmmo: 90,
        reloadStartPolicy: "reset_to_zero",
        reloadCommitPolicy: "commit_on_finish",
      },
      {
        id: "sakuya",
        name: "咲夜",
        cost: 4,
        ammoCapacity: 3,
        reloadTicksPerAmmo: 60,
        reloadStartPolicy: "keep_current",
        reloadCommitPolicy: "commit_on_finish",
      },
    ]);
  });

  it("exports the baseline ability cards", () => {
    expect(DEFAULT_ABILITY_CARDS.map((card) => card.id)).toEqual([
      "extra_life",
      "ember",
      "backdoor",
      "multi_shot",
      "spirit_strike_card",
    ]);
  });
});

describe("@repo/types loadout validation", () => {
  it("calculates total character and ability card cost", () => {
    const loadout: PlayerLoadout = {
      primaryCharacterId: "reimu",
      alternateCharacterId: "sakuya",
      abilityCardIds: ["backdoor"],
    };

    expect(calculateLoadoutCost(loadout)).toBe(9);
  });

  it("accepts a legal standard loadout below the cost limit", () => {
    const result = validateLoadout({
      primaryCharacterId: "reimu",
      alternateCharacterId: "sakuya",
      abilityCardIds: ["backdoor"],
    });

    expect(result).toEqual({
      valid: true,
      totalCost: 9,
      errors: [],
    });
  });

  it("rejects standard loadouts that reach the cost limit", () => {
    const result = validateLoadout({
      primaryCharacterId: "reimu",
      alternateCharacterId: "sakuya",
      abilityCardIds: ["multi_shot", "spirit_strike_card"],
      activeAbilityCardId: "spirit_strike_card",
    });

    expect(result.totalCost).toBe(DEFAULT_COST_LIMIT);
    expect(result.errors).toContain("cost_limit_reached");
    expect(result.valid).toBe(false);
  });

  it("skips the cost cap in training mode", () => {
    const result = validateLoadout(
      {
        primaryCharacterId: "reimu",
        alternateCharacterId: "sakuya",
        abilityCardIds: ["extra_life", "ember"],
      },
      { mode: "training" },
    );

    expect(result.totalCost).toBe(13);
    expect(result.valid).toBe(true);
  });

  it("rejects duplicate characters", () => {
    const result = validateLoadout({
      primaryCharacterId: "reimu",
      alternateCharacterId: "reimu",
      abilityCardIds: [],
    });

    expect(result.errors).toContain("duplicate_characters");
  });

  it("requires the selected active card id to match the active card", () => {
    const missingActiveId = validateLoadout({
      primaryCharacterId: "reimu",
      alternateCharacterId: "sakuya",
      abilityCardIds: ["spirit_strike_card"],
    });
    const invalidActiveId = validateLoadout({
      primaryCharacterId: "reimu",
      alternateCharacterId: "sakuya",
      abilityCardIds: ["backdoor"],
      activeAbilityCardId: "spirit_strike_card",
    });

    expect(missingActiveId.errors).toContain("active_card_id_required");
    expect(invalidActiveId.errors).toContain("active_card_id_invalid");
  });
});

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

    expect(getInitialLives(loadout)).toBe(3);
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
    expect(bulletSpeedRankToPixelsPerTick("low")).toBeCloseTo(
      ARENA_WIDTH / 360,
    );
  });

  it("converts hit circle diameter multipliers", () => {
    expect(hitCircleUnits(4)).toBe(HIT_CIRCLE_DIAMETER * 4);
  });
});
