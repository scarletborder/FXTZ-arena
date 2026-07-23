import type { BattleModelSnapshot } from "@repo/types";
import { describe, expect, it, vi } from "vitest";

import {
  BattleRollbackHistory,
  type BattleRollbackLogger,
} from "./rollback-history";

describe("BattleRollbackHistory", () => {
  it("stores and prunes rollback snapshots independently from debug logging", () => {
    const history = new BattleRollbackHistory({
      sceneData: { mode: "training" },
      debug: false,
      logger: createLogger(),
    });
    const first = { frame: 1 } as unknown as BattleModelSnapshot;
    const second = { frame: 2 } as unknown as BattleModelSnapshot;

    history.recordRollbackSnapshot(1, first);
    history.recordRollbackSnapshot(2, second);
    history.pruneAfter(1);

    expect(history.getSnapshot(1)).toEqual(first);
    expect(history.getSnapshot(2)).toBeNull();
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
