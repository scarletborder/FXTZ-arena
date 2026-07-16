import { createRaidLogicRuntime, type BattleInputState } from "@repo/raid-logic";
import { describe, expect, it } from "vitest";

import { createBattleViewModel } from "./model";

const input: BattleInputState = {
  moveX: 0,
  moveY: 0,
  aimX: 320,
  aimY: 240,
  shootPressed: false,
  bombPressed: false,
  activeCardPressed: false,
  reloadPressed: false,
  alternateHeld: false,
  infoHeld: true,
};

describe("createBattleViewModel", () => {
  it("projects local fighter and crosshair state before Phaser rendering", async () => {
    const runtime = createRaidLogicRuntime({ mode: "training" });
    await runtime.initialize();
    const output = runtime.outputQueue.drainAll().at(-1);
    if (!output) throw new Error("Initial battle output is unavailable");

    const model = createBattleViewModel({
      state: output.state,
      input,
      localFighterKey: "Player2",
      alpha: 0.5,
      rollbackBlend: 0.7,
    });

    expect(model.localFighter).toBe(output.state.target);
    expect(model.primaryCrosshair.ammoCount).toBe(output.state.target.ammo);
    expect(model.primaryCrosshair.pointerX).toBe(input.aimX);
    expect(model.infoHeld).toBe(true);
    expect(model.alpha).toBe(0.5);
    expect(model.rollbackBlend).toBe(0.7);
  });
});
