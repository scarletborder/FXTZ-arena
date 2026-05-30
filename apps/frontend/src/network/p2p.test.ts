import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ConnectionManager } from "./client";
import { P2pConnection } from "./p2p";

describe("P2pConnection", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("RTCPeerConnection", class { });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("starts connecting immediately for Player2 and times out if the peer never advertises intent", () => {
    const connectionManager = {
      send: vi.fn(),
    } as unknown as ConnectionManager;

    const p2p = new P2pConnection(connectionManager, {
      localPlayerId: "Player2",
      enabled: true,
      stunServer: "stun:example.invalid:3478",
      timeoutMs: 10,
      onMessage: vi.fn(),
    });

    p2p.start();

    expect(p2p.status).toBe("connecting");
    expect(connectionManager.send).toHaveBeenCalledWith({ type: "p2p_intent", enabled: true });

    vi.advanceTimersByTime(10);

    expect(p2p.status).toBe("failed");
  });
});