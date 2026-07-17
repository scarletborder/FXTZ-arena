import { describe, expect, it } from "vitest";
import { OWN_PROJECTILE_ALPHA } from "@repo/constants";
import type { ProjectileState } from "@repo/types";

import { projectileAlpha } from "./display";

describe("projectileAlpha", () => {
  it("dims local fighter projectiles in normal versus rendering", () => {
    expect(
      projectileAlpha(projectile({ owner: "Player1" }), "Player1", "versus"),
    ).toBe(OWN_PROJECTILE_ALPHA);
  });

  it("keeps both sides opaque in local single-device versus rendering", () => {
    expect(
      projectileAlpha(projectile({ owner: "Player1" }), "Player1", "versus", {
        localSingleDevice: true,
      }),
    ).toBe(1);
    expect(
      projectileAlpha(projectile({ owner: "Player2" }), "Player1", "versus", {
        localSingleDevice: true,
      }),
    ).toBe(1);
  });
});

function projectile(params: { owner: "Player1" | "Player2" }) {
  return {
    owner: params.owner,
    kind: "orb",
    renderHeight: 12,
    height: 12,
    damage: 1,
  } as unknown as ProjectileState;
}
