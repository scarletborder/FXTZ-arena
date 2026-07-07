import { describe, expect, it } from "vitest";

import { resolveAccountBattleInput, resolveAccountBattleProfileId, resolveRuntimeBattleInput } from "./profile";

describe("resolveAccountBattleProfileId", () => {
  it("uses the active battle profile in training mode", () => {
    const profile = resolveAccountBattleProfileId(
      {
        p1ProfileId: "default",
        p2ProfileId: "tournament",
        battleProfile: "Player2",
      },
      { localSingleDevice: false },
    );

    expect(profile).toBe("tournament");
  });

  it("keeps player one profile for local single-device battles", () => {
    const profile = resolveAccountBattleProfileId(
      {
        p1ProfileId: "default",
        p2ProfileId: "tournament",
        battleProfile: "Player2",
      },
      { localSingleDevice: true },
    );

    expect(profile).toBe("default");
  });
});

describe("resolveAccountBattleInput", () => {
  it("uses the active battle input in training mode", () => {
    const input = resolveAccountBattleInput(
      {
        p1Input: "keyboard",
        p2Input: "joystick:0",
        battleProfile: "Player2",
      },
      { localSingleDevice: false },
    );

    expect(input).toBe("joystick:0");
  });

  it("keeps player one input for local single-device battles", () => {
    const input = resolveAccountBattleInput(
      {
        p1Input: "keyboard",
        p2Input: "joystick:0",
        battleProfile: "Player2",
      },
      { localSingleDevice: true },
    );

    expect(input).toBe("keyboard");
  });
});

describe("resolveRuntimeBattleInput", () => {
  it("falls back to keyboard when mobile controls are unavailable", () => {
    expect(resolveRuntimeBattleInput("mobile", { mobileControlsEnabled: false })).toBe("keyboard");
  });

  it("keeps mobile input when virtual controls are enabled", () => {
    expect(resolveRuntimeBattleInput("mobile", { mobileControlsEnabled: true })).toBe("mobile");
  });

  it("falls back to keyboard when the selected joystick is unavailable", () => {
    expect(resolveRuntimeBattleInput("joystick:0", {
      mobileControlsEnabled: false,
      joystickAvailable: false,
    })).toBe("keyboard");
  });

  it("keeps an available joystick input", () => {
    expect(resolveRuntimeBattleInput("joystick:0", {
      mobileControlsEnabled: false,
      joystickAvailable: true,
    })).toBe("joystick:0");
  });
});
