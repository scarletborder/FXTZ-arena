import { describe, expect, it } from "vitest";

import type { ClientMessage, ServerMessage } from "./messages";
import {
  decodeProtocolMessage,
  encodeProtocolMessage,
  encodeProtocolStreamPacket,
  ProtocolStreamDecoder,
} from "./binary";

describe("protocol binary codec", () => {
  it("round-trips compact client input frames", () => {
    const message: ClientMessage = {
      type: "input_frame",
      frame: 120,
      ackFrame: 118,
      moveX: -1,
      moveY: 1,
      aimX: 845.3833799776838,
      aimY: 428.8524590163934,
      shootPressed: true,
      bombPressed: false,
      activeCardPressed: true,
      reloadPressed: false,
      alternateHeld: true,
      infoHeld: false,
    };

    const encoded = encodeProtocolMessage(message);

    expect(decodeProtocolMessage(encoded)).toEqual(message);
  });

  it("round-trips unreliable redundant input frames as binary", () => {
    const message = {
      type: "input_frame",
      frame: 8,
      ackFrame: 4,
      moveX: 1,
      moveY: 0,
      aimX: 123.25,
      aimY: 456.5,
      shootPressed: true,
      bombPressed: false,
      activeCardPressed: false,
      reloadPressed: true,
      alternateHeld: false,
      infoHeld: true,
      UnreliableLinkExtra: {
        redundantInputs: [
          {
            frame: 7,
            moveX: -1,
            moveY: 1,
            aimX: 111.125,
            aimY: 222.25,
            shootPressed: false,
            bombPressed: true,
            activeCardPressed: false,
            reloadPressed: false,
            alternateHeld: true,
            infoHeld: false,
          },
        ],
      },
    } as const;

    const encoded = encodeProtocolMessage(message);
    expect(encoded[1]).not.toBe(255);
    expect(decodeProtocolMessage(encoded)).toEqual(message);
  });

  it("round-trips compact relayed input frames", () => {
    const message: ServerMessage = {
      type: "input_frame",
      playerId: "Player2",
      frame: 42,
      ackFrame: 40,
      moveX: 0,
      moveY: -1,
      aimX: 12,
      aimY: 34,
      shootPressed: false,
      bombPressed: true,
      activeCardPressed: false,
      reloadPressed: true,
      alternateHeld: false,
      infoHeld: true,
    };

    expect(decodeProtocolMessage(encodeProtocolMessage(message))).toEqual(message);
  });

  it("round-trips transition ready inputs", () => {
    const message: ClientMessage = {
      type: "input_frame",
      frame: 18,
      ackFrame: 17,
      moveX: 0,
      moveY: 0,
      aimX: 400,
      aimY: 300,
      shootPressed: false,
      bombPressed: false,
      activeCardPressed: false,
      reloadPressed: false,
      alternateHeld: false,
      infoHeld: false,
      transitionReadyPressed: true,
    };

    expect(decodeProtocolMessage(encodeProtocolMessage(message))).toEqual(message);
  });

  it("round-trips collaborate shop inputs", () => {
    const message: ClientMessage = {
      type: "input_frame",
      frame: 28,
      ackFrame: 27,
      moveX: 0,
      moveY: 0,
      aimX: 400,
      aimY: 300,
      shootPressed: false,
      bombPressed: false,
      activeCardPressed: false,
      reloadPressed: false,
      alternateHeld: false,
      infoHeld: false,
      shopReadyPressed: true,
      shopPurchaseItemId: "shop-1:card:multi_shot",
      activeCardSwitchId: "spirit_strike_card",
      UnreliableLinkExtra: {
        redundantInputs: [
          {
            frame: 27,
            moveX: 0,
            moveY: 0,
            aimX: 401,
            aimY: 301,
            shootPressed: false,
            bombPressed: false,
            activeCardPressed: false,
            reloadPressed: false,
            alternateHeld: false,
            infoHeld: false,
            shopPurchaseItemId: "shop-1:life",
            activeCardSwitchId: "spirit_strike_card",
          },
        ],
      },
    };

    expect(decodeProtocolMessage(encodeProtocolMessage(message))).toEqual(message);
  });

  it("keeps low-frequency messages in binary-framed JSON", () => {
    const message: ClientMessage = {
      type: "hello",
      username: "player",
      clientVersion: "test",
      debug: true,
    };

    const encoded = encodeProtocolMessage(message);

    expect(encoded).toBeInstanceOf(Uint8Array);
    expect(decodeProtocolMessage(encoded)).toEqual(message);
  });

  it("decodes legacy text JSON for compatibility", () => {
    const message: ServerMessage = { type: "pong", seq: 123 };

    expect(decodeProtocolMessage(JSON.stringify(message))).toEqual(message);
  });

  it("reassembles stream packets split across chunks", () => {
    const first: ClientMessage = { type: "ping", seq: 1 };
    const second: ClientMessage = {
      type: "game_over",
      frame: 9,
      ackFrame: 8,
      winnerPlayerId: "Player1",
    };
    const decoder = new ProtocolStreamDecoder();
    const packet = concat(encodeProtocolStreamPacket(first), encodeProtocolStreamPacket(second));

    expect(decoder.push(packet.subarray(0, 5))).toEqual([]);
    expect(decoder.push(packet.subarray(5))).toEqual([first, second]);
  });
});

function concat(left: Uint8Array, right: Uint8Array): Uint8Array {
  const merged = new Uint8Array(left.byteLength + right.byteLength);
  merged.set(left, 0);
  merged.set(right, left.byteLength);
  return merged;
}
