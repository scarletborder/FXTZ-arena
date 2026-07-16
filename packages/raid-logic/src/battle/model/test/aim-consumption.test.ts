import { describe, expect, it } from "vitest";

import { createBattleModel, input } from "./helpers";

describe("passive aim consumption", () => {
  it("marks Backdoor familiar positioning as aim-consuming", async () => {
    const model = await createBattleModel("reimu", "marisa", ["backdoor"]);

    model.step(input({ aimX: 320, aimY: 180 }));

    expect(model.aimConsumedThisFrame).toBe(true);
  });

  it("marks Yukari companion positioning as aim-consuming", async () => {
    const model = await createBattleModel("reimu", "yukari");

    model.step(input({ aimX: 320, aimY: 180 }));

    expect(model.aimConsumedThisFrame).toBe(true);
  });
});
