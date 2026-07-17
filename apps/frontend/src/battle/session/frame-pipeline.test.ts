import { describe, expect, it, vi } from "vitest";
import { createRaidLogicRuntime } from "@repo/raid-logic";
import type { BattleInputState } from "@repo/types";

import { BattleFramePipeline } from "./frame-pipeline";

const idleInput: BattleInputState = {
  moveX: 0,
  moveY: 0,
  aimX: 640,
  aimY: 360,
  shootPressed: false,
  bombPressed: false,
  activeCardPressed: false,
  reloadPressed: false,
  alternateHeld: false,
  infoHeld: false,
};

describe("BattleFramePipeline", () => {
  it("advances deterministic logic on fixed battle frames", async () => {
    const runtime = createRaidLogicRuntime({ mode: "training" });
    await runtime.initialize();
    const recordOutputFrame = vi.fn();
    const recordInputFrame = vi.fn();
    const pipeline = new BattleFramePipeline(runtime, {
      fixedStepMs: 10,
      mode: "training",
      localSingleDevice: false,
      isLogicReady: () => true,
      isInputLocked: () => false,
      createInput: () => idleInput,
      createTargetInput: () => idleInput,
      isSyncRunning: () => false,
      stepSync: vi.fn(),
      recordOutputFrame,
      recordInputFrame,
      shouldFinishBattle: () => false,
      finishBattle: vi.fn(),
    });
    pipeline.update(25, "Player1");
    expect(runtime.frame).toBe(2);
    expect(pipeline.getAccumulator()).toBe(5);
    expect(recordOutputFrame).toHaveBeenCalledTimes(2);
    expect(recordInputFrame).toHaveBeenCalledTimes(2);
  });

  it("routes frames through sync without stepping local logic", async () => {
    const runtime = createRaidLogicRuntime({ mode: "online" });
    await runtime.initialize();
    const stepSync = vi.fn();
    const pipeline = new BattleFramePipeline(runtime, {
      fixedStepMs: 10,
      mode: "online",
      localSingleDevice: false,
      isLogicReady: () => true,
      isInputLocked: () => false,
      createInput: () => idleInput,
      createTargetInput: () => idleInput,
      isSyncRunning: () => true,
      stepSync,
      recordOutputFrame: vi.fn(),
      recordInputFrame: vi.fn(),
      shouldFinishBattle: () => false,
      finishBattle: vi.fn(),
    });
    pipeline.update(10, "Player1");
    expect(stepSync).toHaveBeenCalledWith(idleInput);
    expect(runtime.frame).toBe(0);
  });

  it("steps both fighters in single-device battles", async () => {
    const runtime = createRaidLogicRuntime({ mode: "online" });
    await runtime.initialize();
    const targetInput: BattleInputState = { ...idleInput, moveX: 1 };
    const pipeline = new BattleFramePipeline(runtime, {
      fixedStepMs: 10,
      mode: "local",
      localSingleDevice: true,
      isLogicReady: () => true,
      isInputLocked: () => false,
      createInput: () => idleInput,
      createTargetInput: () => targetInput,
      isSyncRunning: () => false,
      stepSync: vi.fn(),
      recordOutputFrame: vi.fn(),
      recordInputFrame: vi.fn(),
      shouldFinishBattle: () => false,
      finishBattle: vi.fn(),
    });
    pipeline.update(10, "Player1");
    expect(runtime.lastPlayerInput).toEqual(idleInput);
    expect(runtime.lastTargetInput).toEqual(targetInput);
  });
});
