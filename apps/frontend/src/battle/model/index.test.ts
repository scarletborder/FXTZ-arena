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

describe("BattleModel reload timing", () => {
  it("scales non-reset reloads by missing ammo", () => {
    const sakuyaModel = new BattleModel();
    sakuyaModel.step(input({ shootPressed: true }));
    sakuyaModel.step(input({ reloadPressed: true }));
    expect(sakuyaModel.player.reloadTotal).toBe(60);

    const reimuModel = new BattleModel();
    reimuModel.reset();
    reimuModel.step(input({ shootPressed: true }));
    reimuModel.step(input({ reloadPressed: true }));
    expect(reimuModel.player.reloadTotal).toBe(48);
  });

  it("keeps Sakuya's current ammo when reloading from one ammo", () => {
    const model = new BattleModel();
    model.step(input({ shootPressed: true }));
    for (let index = 0; index < 10; index += 1) {
      model.step(input());
    }
    model.step(input({ shootPressed: true }));
    expect(model.player.ammo).toBe(1);

    model.step(input({ reloadPressed: true }));

    expect(model.player.ammo).toBe(1);
    expect(model.player.reloadStartedAmmo).toBe(1);
    expect(model.player.reloadTotal).toBe(120);
  });

  it("uses full reload time for reset-to-zero characters", () => {
    const model = new BattleModel();
    model.reset();
    model.step(input({ alternateHeld: true, shootPressed: true }));
    model.step(input({ alternateHeld: true, reloadPressed: true }));

    expect(model.player.reloadTotal).toBe(180);
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

function input(overrides: Partial<BattleInputState> = {}): BattleInputState {
  return {
    moveX: 0,
    moveY: 0,
    aimX: 900,
    aimY: 340,
    shootPressed: false,
    bombPressed: false,
    activeCardPressed: false,
    reloadPressed: false,
    alternateHeld: false,
    infoHeld: false,
    ...overrides,
  };
}
