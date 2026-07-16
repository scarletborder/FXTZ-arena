import { FIXED_STEP_MS } from "@repo/constants";
import {
  createRaidLogicRuntime,
  type BattleInputState,
} from "@repo/raid-logic";
import { describe, expect, it, vi } from "vitest";

import { BattleSession } from "./battle-session";
import type { BattleRollbackLogger } from "./rollback-history";

const idleInput: BattleInputState = {
  moveX: 0,
  moveY: 0,
  aimX: 640,
  aimY: 338,
  shootPressed: false,
  bombPressed: false,
  activeCardPressed: false,
  reloadPressed: false,
  alternateHeld: false,
  infoHeld: false,
};

describe("BattleSession", () => {
  it("owns initial output recording and fixed-frame advancement", async () => {
    const runtime = createRaidLogicRuntime({ mode: "training" });
    await runtime.initialize();
    const recordInputFrame = vi.fn();
    const session = new BattleSession({
      sceneData: { mode: "training", runtime },
      connection: { send: vi.fn(), setMessageHandler: vi.fn() },
      networkHost: {
        showStatus: vi.fn(),
        hideStatus: vi.fn(),
        delay: vi.fn(),
        finishBattle: vi.fn(),
      },
      output: {
        isDebugEnabled: () => false,
        logger: createLogger(),
        present: vi.fn(),
      },
      input: {
        isLocked: () => false,
        create: () => idleInput,
        createTarget: () => idleInput,
      },
      host: {
        isActive: () => true,
        recordInputFrame,
        shouldFinishBattle: () => false,
        finishBattle: vi.fn(),
        onRollback: vi.fn(),
      },
    });

    expect(session.getCurrentOutput().frame).toBe(0);

    session.update(FIXED_STEP_MS);

    expect(session.getRuntime().frame).toBe(1);
    expect(session.getCurrentOutput().frame).toBe(1);
    expect(session.getRollbackHistory().getSnapshot(1)).not.toBeNull();
    expect(recordInputFrame).toHaveBeenCalledTimes(1);
  });

  it("owns online synchronization cleanup", async () => {
    const runtime = createRaidLogicRuntime({ mode: "online" });
    await runtime.initialize();
    const setMessageHandler = vi.fn();
    const session = new BattleSession({
      sceneData: { mode: "online", runtime },
      connection: { send: vi.fn(), setMessageHandler },
      networkHost: {
        showStatus: vi.fn(),
        hideStatus: vi.fn(),
        delay: vi.fn(),
        finishBattle: vi.fn(),
      },
      output: {
        isDebugEnabled: () => false,
        logger: createLogger(),
        present: vi.fn(),
      },
      input: {
        isLocked: () => false,
        create: () => idleInput,
        createTarget: () => idleInput,
      },
      host: {
        isActive: () => true,
        recordInputFrame: vi.fn(),
        shouldFinishBattle: () => false,
        finishBattle: vi.fn(),
        onRollback: vi.fn(),
      },
    });

    expect(session.isSyncRunning()).toBe(true);
    session.destroy();
    expect(setMessageHandler).toHaveBeenLastCalledWith(null);
  });
});

function createLogger(): BattleRollbackLogger {
  return {
    reset: vi.fn(),
    recordStepInputs: vi.fn(),
    recordConfirmedInputs: vi.fn(),
    recordFrame: vi.fn(() => null),
    recordConfirmedFrame: vi.fn(() => null),
    pruneAfter: vi.fn(),
    getConfirmedRows: vi.fn(() => []),
    writeFile: vi.fn(() => null),
  };
}
