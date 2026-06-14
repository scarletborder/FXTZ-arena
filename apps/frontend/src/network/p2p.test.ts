import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ServerMessage } from "@repo/types";

import type { ConnectionManager } from "./client";
import { dataChannelMessageToPeerServerMessage } from "./handler";
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

  it("tracks peer loading completion messages", () => {
    const connectionManager = {
      send: vi.fn(),
    } as unknown as ConnectionManager;
    const onMessage = vi.fn();

    const p2p = new P2pConnection(connectionManager, {
      localPlayerId: "Player1",
      enabled: true,
      stunServer: "stun:example.invalid:3478",
      onMessage,
    });

    expect(p2p.remoteLoadingDone).toBe(false);

    const handled = p2p.handleServerMessage({
      type: "peer_loading_done",
      playerId: "Player2",
    });

    expect(handled).toBe(true);
    expect(p2p.remoteLoadingDone).toBe(true);
    expect(onMessage).toHaveBeenCalledWith({
      type: "peer_loading_done",
      playerId: "Player2",
    });
  });

  it("maps game_over packets to peer_game_over", () => {
    const connectionManager = {
      send: vi.fn(),
    } as unknown as ConnectionManager;
    const onMessage = vi.fn();

    const p2p = new P2pConnection(connectionManager, {
      localPlayerId: "Player1",
      enabled: true,
      stunServer: "stun:example.invalid:3478",
      onMessage,
    });

    const handled = p2p.handleServerMessage({
      type: "game_over",
      frame: 42,
      ackFrame: 40,
      winnerPlayerId: "Player1",
    } as unknown as ServerMessage);

    expect(handled).toBe(false);

    // Simulate the same packet arriving through the RTC channel mapping.
    const mapped = dataChannelMessageToPeerServerMessage(
      { localPlayerId: "Player1", remotePlayerId: "Player2" },
      {
        type: "game_over",
        frame: 42,
        ackFrame: 40,
        winnerPlayerId: "Player1",
      } as unknown as ServerMessage,
    );
    expect(mapped).toEqual({
      type: "peer_game_over",
      playerId: "Player2",
      frame: 42,
      ackFrame: 40,
      winnerPlayerId: "Player1",
    });
    onMessage(mapped);
  });
});
