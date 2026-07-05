import { describe, expect, it } from "vitest";

import { resolveAccountBattleProfile } from "./profile";

describe("resolveAccountBattleProfile", () => {
  it("uses the active battle profile in training mode", () => {
    const profile = resolveAccountBattleProfile(
      {
        p1Profile: "keyboard",
        p2Profile: "mobile",
        battleProfile: "Player2",
      },
      { localSingleDevice: false },
    );

    expect(profile).toBe("mobile");
  });

  it("keeps player one profile for local single-device battles", () => {
    const profile = resolveAccountBattleProfile(
      {
        p1Profile: "keyboard",
        p2Profile: "mobile",
        battleProfile: "Player2",
      },
      { localSingleDevice: true },
    );

    expect(profile).toBe("keyboard");
  });
});
