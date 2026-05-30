import { describe, expect, it, vi } from "vitest";

import type { BattleOutputFrame } from "@repo/raid-logic";
import { BattleDebugLogger } from ".";

describe("BattleDebugLogger", () => {
  it("exports only authoritative frame inputs", () => {
    const logger = new BattleDebugLogger();
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    logger.recordStepInputs({
      frame: 1,
      player: input(111, 222),
      target: input(333, 444),
    }, true);
    logger.recordConfirmedInputs({
      frame: 1,
      confirmedThrough: 1,
      player: input(845.3833799776838, 428.8524590163934),
      target: input(600, 360),
    }, true);
    logger.recordFrame(output(0), { enabled: true, localConfirmedFrame: 0 });
    logger.recordFrame(output(1), { enabled: true, localConfirmedFrame: 0 });
    logger.recordConfirmedFrame({
      enabled: true,
      frame: 0,
      hash: "097fbb9a",
      confirmedThrough: 0,
    });
    logger.recordConfirmedFrame({
      enabled: true,
      frame: 1,
      hash: "ff26ab55",
      confirmedThrough: 1,
    });

    logger.writeFile({
      sceneData: {
        mode: "online",
        battleConfig: { battleId: "debug-test" },
      } as never,
      winnerPlayerId: "Player2",
      localPlayerId: "Player1",
      runtimeFrame: 12,
      targetFrame: 1,
      serverConfirmedFrame: 1,
      authoritativeFrame: 1,
      localConfirmedFrame: 1,
      finalGlobalHash: "hash",
      sampledConfirmedFrames: {
        from: 0,
        to: 1,
        count: 2,
        complete: true,
      },
    });

    const payloadText = logSpy.mock.calls
      .map((call) => String(call[0]))
      .find((line) => line.includes("\"frames\""));
    expect(payloadText).toBeDefined();
    const payload = JSON.parse(payloadText!) as {
      frames: Array<{ frame: number; player1Input: { aimX: number } | null }>;
      localFrames?: unknown[];
      revisions?: unknown[];
      finalGlobalHash: string | null;
    };
    expect(payload.frames.map((frame) => frame.frame)).toEqual([0, 1]);
    expect(payload.frames[1]?.player1Input?.aimX).toBe(845.3833799776838);
    expect(payload.localFrames).toBeUndefined();
    expect(payload.revisions).toBeUndefined();
    expect(payload.finalGlobalHash).toBe("hash");

    logSpy.mockRestore();
    warnSpy.mockRestore();
  });
});

function output(frame: number): BattleOutputFrame {
  return {
    frame,
    hash: frame,
    hashHex: frame === 0 ? "097fbb9a" : "ff26ab55",
    events: [{ type: frame === 0 ? "snapshot_restored" : "frame_advanced" }],
    state: {},
    snapshot: {},
  } as unknown as BattleOutputFrame;
}

function input(aimX: number, aimY: number) {
  return {
    moveX: 0,
    moveY: 0,
    aimX,
    aimY,
    shootPressed: false,
    bombPressed: false,
    activeCardPressed: false,
    reloadPressed: false,
    alternateHeld: false,
    infoHeld: false,
  } as const;
}
