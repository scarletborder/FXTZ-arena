import { describe, expect, it, vi } from "vitest";
import { createRaidLogicRuntime } from "@repo/raid-logic";
import type { ServerMessage } from "@repo/types";

import type { CombatConnection } from "../../network/combat";
import type { PeerConnection, P2pStatus } from "../../network/p2p";
import {
  BattleNetworkSession,
  type BattleNetworkHost,
  type BattleNetworkSessionOptions,
} from "./network-session";

describe("BattleNetworkSession", () => {
  it("does not install sync for offline battle modes", () => {
    const connection = createConnection();
    const host = createHost();
    const session = new BattleNetworkSession(
      createOptions({ mode: "training" }, connection, host),
    );

    expect(session.isSyncRunning()).toBe(false);
    expect(connection.setMessageHandler).not.toHaveBeenCalled();
    expect(host.showStatus).not.toHaveBeenCalled();
  });

  it("presents peer status through the host interface", () => {
    const connection = createConnection();
    const host = createHost();
    const p2p = new FakePeerConnection();
    const session = new BattleNetworkSession(
      createOptions({ mode: "online", p2p }, connection, host),
    );

    p2p.emitStatus("connecting");
    p2p.emitStatus("connected");

    expect(session.isSyncRunning()).toBe(true);
    expect(host.showStatus).toHaveBeenCalledTimes(2);
    expect(host.delay).toHaveBeenCalledWith(700, expect.any(Function));
    expect(p2p.started).toBe(true);
  });
});

function createOptions(
  sceneData: BattleNetworkSessionOptions["sceneData"],
  connection: CombatConnection,
  host: BattleNetworkHost,
): BattleNetworkSessionOptions {
  return {
    sceneData,
    runtime: createRaidLogicRuntime({
      mode: sceneData.mode === "online" ? "online" : "training",
    }),
    connection,
    host,
    recordStepInputs: vi.fn(),
    recordConfirmedInputs: vi.fn(),
    recordFrame: vi.fn(),
    getRollbackRecord: () => null,
    pruneAfter: vi.fn(),
    pruneBefore: vi.fn(),
    onRollback: vi.fn(),
  };
}

function createConnection(): CombatConnection & {
  setMessageHandler: ReturnType<typeof vi.fn>;
} {
  return {
    send: vi.fn(),
    setMessageHandler: vi.fn(),
  };
}

function createHost(): BattleNetworkHost & {
  showStatus: ReturnType<typeof vi.fn>;
  delay: ReturnType<typeof vi.fn>;
} {
  return {
    showStatus: vi.fn(),
    hideStatus: vi.fn(),
    delay: vi.fn(),
    finishBattle: vi.fn(),
  };
}

class FakePeerConnection implements PeerConnection {
  connected = false;
  remoteLoadingDone = false;
  status: P2pStatus = "idle";
  started = false;
  private statusHandler: ((status: P2pStatus) => void) | undefined;

  start(): void {
    this.started = true;
  }

  close(): void {}

  setStatusHandler(handler: ((status: P2pStatus) => void) | undefined): void {
    this.statusHandler = handler;
  }

  setMessageHandler(handler: (message: ServerMessage) => void): void {
    void handler;
  }

  handleServerMessage(message: ServerMessage): boolean {
    void message;
    return false;
  }

  send(): boolean {
    return false;
  }

  emitStatus(status: P2pStatus): void {
    this.status = status;
    this.statusHandler?.(status);
  }
}
