import { describe, expect, it } from "vitest";

import { resolveAccountBattleInput, resolveAccountBattleProfileId } from "./profile";

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
