import { describe, expect, it, vi } from "vitest";

import type { BattleInputState } from "../types";
import { BattleModel } from ".";

describe("BattleModel rollback snapshots", () => {
  it("restores frame-relative timers without changing replay results", () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const model = new BattleModel();
    const inputs = createInputs(100);

    for (let index = 0; index < 12; index += 1) {
      model.step(inputs[index]!);
    }

    const snapshot = model.serialize();
    const snapshotHash = model.hash();

    for (let index = 12; index < inputs.length; index += 1) {
      model.step(inputs[index]!);
    }
    const originalHash = model.hash();

    model.deserialize(snapshot);
    expect(model.frame).toBe(snapshot.frame);
    expect(model.hash()).toBe(snapshotHash);

    for (let index = 12; index < inputs.length; index += 1) {
      model.step(inputs[index]!);
    }

    expect(model.hash()).toBe(originalHash);
    logSpy.mockRestore();
  });
});

function createInputs(frames: number): BattleInputState[] {
  return Array.from({ length: frames }, (_, frame) => ({
    moveX: frame % 5 === 0 ? 1 : 0,
    moveY: frame % 7 === 0 ? -1 : 0,
    aimX: 900,
    aimY: 340,
    shootPressed: frame === 4 || frame === 14 || frame === 31,
    bombPressed: frame === 2,
    activeCardPressed: frame === 24,
    reloadPressed: frame === 18,
    alternateHeld: frame >= 36 && frame < 48,
    infoHeld: frame % 11 === 0,
  }));
}
