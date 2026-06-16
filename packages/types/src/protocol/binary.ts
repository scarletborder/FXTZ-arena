import { fp } from "@shaisrc/fixed-point";
import type { ClientMessage, ServerMessage } from "./messages";

const VERSION = 1;
const JSON_MESSAGE = 255;

const CLIENT_INPUT_FRAME = 1;
const CLIENT_GAME_OVER = 2;
const CLIENT_PING = 3;
const SERVER_INPUT_FRAME = 17;
const SERVER_PEER_GAME_OVER = 18;
const SERVER_PONG = 19;

const HEADER_SIZE = 2;
const INPUT_FIXED_FIELDS_SIZE = 12;
const REDUNDANT_INPUT_FIXED_FIELDS_SIZE = 8;
const INPUT_STRING_LENGTH_SIZE = 2;
const CLIENT_GAME_OVER_SIZE = HEADER_SIZE + 9;
const PING_SIZE = HEADER_SIZE + 8;
const SERVER_PEER_GAME_OVER_SIZE = HEADER_SIZE + 10;
const STREAM_LENGTH_SIZE = 4;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

type ProtocolMessage = ClientMessage | ServerMessage;

export function encodeProtocolMessage(message: ProtocolMessage): Uint8Array {
  switch (message.type) {
    case "input_frame":
      return "playerId" in message ? encodeServerInputFrame(message) : encodeClientInputFrame(message);
    case "game_over":
      return encodeClientGameOver(message);
    case "peer_game_over":
      return encodePeerGameOver(message);
    case "ping":
      return encodePing(message.seq, CLIENT_PING);
    case "pong":
      return encodePing(message.seq, SERVER_PONG);
    default:
      return encodeJsonMessage(message);
  }
}

export function decodeProtocolMessage(data: unknown): unknown | undefined {
  if (typeof data === "string") {
    return parseJson(data);
  }

  const bytes = toUint8Array(data);
  if (!bytes || bytes.byteLength < HEADER_SIZE) {
    return undefined;
  }

  if (bytes[0] !== VERSION) {
    return parseJson(decoder.decode(bytes));
  }

  const view = dataViewFor(bytes);
  try {
    switch (bytes[1]) {
      case JSON_MESSAGE:
        return parseJson(decoder.decode(bytes.subarray(HEADER_SIZE)));
      case CLIENT_INPUT_FRAME:
        return decodeClientInputFrame(view);
      case SERVER_INPUT_FRAME:
        return decodeServerInputFrame(view);
      case CLIENT_GAME_OVER:
        return decodeClientGameOver(view);
      case SERVER_PEER_GAME_OVER:
        return decodePeerGameOver(view);
      case CLIENT_PING:
        return decodePing(view, "ping");
      case SERVER_PONG:
        return decodePing(view, "pong");
      default:
        return undefined;
    }
  } catch {
    return undefined;
  }
}

export function encodeProtocolStreamPacket(message: ProtocolMessage): Uint8Array {
  const body = encodeProtocolMessage(message);
  const packet = new Uint8Array(STREAM_LENGTH_SIZE + body.byteLength);
  new DataView(packet.buffer).setUint32(0, body.byteLength, true);
  packet.set(body, STREAM_LENGTH_SIZE);
  return packet;
}

export class ProtocolStreamDecoder {
  private buffer = new Uint8Array(0);

  push(chunk: Uint8Array): unknown[] {
    if (chunk.byteLength === 0) {
      return [];
    }

    const merged = new Uint8Array(this.buffer.byteLength + chunk.byteLength);
    merged.set(this.buffer, 0);
    merged.set(chunk, this.buffer.byteLength);
    this.buffer = merged;

    const messages: unknown[] = [];
    let offset = 0;
    while (this.buffer.byteLength - offset >= STREAM_LENGTH_SIZE) {
      const length = new DataView(this.buffer.buffer, this.buffer.byteOffset + offset, STREAM_LENGTH_SIZE).getUint32(0, true);
      const packetStart = offset + STREAM_LENGTH_SIZE;
      const packetEnd = packetStart + length;
      if (this.buffer.byteLength < packetEnd) {
        break;
      }

      const decoded = decodeProtocolMessage(this.buffer.subarray(packetStart, packetEnd));
      if (decoded !== undefined) {
        messages.push(decoded);
      }
      offset = packetEnd;
    }

    this.buffer = this.buffer.subarray(offset);
    return messages;
  }
}

function encodeClientInputFrame(message: Extract<ClientMessage, { type: "input_frame" }>): Uint8Array {
  const bytes = new Uint8Array(HEADER_SIZE + inputPayloadSize(message));
  const view = dataViewFor(bytes);
  writeHeader(bytes, CLIENT_INPUT_FRAME);
  writeInputFields(view, 2, message);
  return bytes;
}

function encodeServerInputFrame(message: Extract<ServerMessage, { type: "input_frame" }>): Uint8Array {
  const bytes = new Uint8Array(HEADER_SIZE + 1 + inputPayloadSize(message));
  const view = dataViewFor(bytes);
  writeHeader(bytes, SERVER_INPUT_FRAME);
  view.setUint8(2, encodePlayerId(message.playerId));
  writeInputFields(view, 3, message);
  return bytes;
}

function encodeClientGameOver(message: Extract<ClientMessage, { type: "game_over" }>): Uint8Array {
  const bytes = new Uint8Array(CLIENT_GAME_OVER_SIZE);
  const view = dataViewFor(bytes);
  writeHeader(bytes, CLIENT_GAME_OVER);
  view.setUint32(2, message.frame, true);
  view.setUint32(6, message.ackFrame, true);
  view.setUint8(10, encodePlayerId(message.winnerPlayerId));
  return bytes;
}

function encodePeerGameOver(message: Extract<ServerMessage, { type: "peer_game_over" }>): Uint8Array {
  const bytes = new Uint8Array(SERVER_PEER_GAME_OVER_SIZE);
  const view = dataViewFor(bytes);
  writeHeader(bytes, SERVER_PEER_GAME_OVER);
  view.setUint8(2, encodePlayerId(message.playerId));
  view.setUint32(3, message.frame, true);
  view.setUint32(7, message.ackFrame, true);
  view.setUint8(11, encodePlayerId(message.winnerPlayerId));
  return bytes;
}

function encodePing(messageSeq: number, code: number): Uint8Array {
  const bytes = new Uint8Array(PING_SIZE);
  const view = dataViewFor(bytes);
  writeHeader(bytes, code);
  view.setFloat64(2, messageSeq, true);
  return bytes;
}

function encodeJsonMessage(message: ProtocolMessage): Uint8Array {
  const json = encoder.encode(JSON.stringify(message));
  const bytes = new Uint8Array(HEADER_SIZE + json.byteLength);
  writeHeader(bytes, JSON_MESSAGE);
  bytes.set(json, HEADER_SIZE);
  return bytes;
}

function decodeClientInputFrame(view: DataView): ClientMessage {
  return {
    type: "input_frame",
    ...readInputFields(view, 2),
  };
}

function decodeServerInputFrame(view: DataView): ServerMessage {
  return {
    type: "input_frame",
    playerId: decodePlayerId(view.getUint8(2)),
    ...readInputFields(view, 3),
  };
}

function decodeClientGameOver(view: DataView): ClientMessage {
  ensureSize(view, CLIENT_GAME_OVER_SIZE);
  return {
    type: "game_over",
    frame: view.getUint32(2, true),
    ackFrame: view.getUint32(6, true),
    winnerPlayerId: decodePlayerId(view.getUint8(10)),
  };
}

function decodePeerGameOver(view: DataView): ServerMessage {
  ensureSize(view, SERVER_PEER_GAME_OVER_SIZE);
  return {
    type: "peer_game_over",
    playerId: decodePlayerId(view.getUint8(2)),
    frame: view.getUint32(3, true),
    ackFrame: view.getUint32(7, true),
    winnerPlayerId: decodePlayerId(view.getUint8(11)),
  };
}

function decodePing(view: DataView, type: "ping" | "pong"): ClientMessage | ServerMessage {
  ensureSize(view, PING_SIZE);
  return { type, seq: view.getFloat64(2, true) } as ClientMessage | ServerMessage;
}

function writeInputFields(
  view: DataView,
  offset: number,
  message: Extract<ClientMessage | ServerMessage, { type: "input_frame" }>,
): void {
  const aimX = encodePreciseNumber(message.aimX);
  const aimY = encodePreciseNumber(message.aimY);
  const bytes = new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
  view.setUint32(offset, message.frame, true);
  view.setUint32(offset + 4, message.ackFrame, true);
  view.setInt8(offset + 8, message.moveX);
  view.setInt8(offset + 9, message.moveY);
  view.setUint16(offset + 10, encodeButtons(message), true);
  writeLengthPrefixedString(view, bytes, offset + 12, aimX);
  const aimYOffset = offset + 12 + INPUT_STRING_LENGTH_SIZE + aimX.byteLength;
  writeLengthPrefixedString(view, bytes, aimYOffset, aimY);
  const shopPurchase = encoder.encode(message.shopPurchaseItemId ?? "");
  const shopPurchaseOffset = aimYOffset + INPUT_STRING_LENGTH_SIZE + aimY.byteLength;
  writeLengthPrefixedString(view, bytes, shopPurchaseOffset, shopPurchase);
  const activeCardSwitch = encoder.encode(message.activeCardSwitchId ?? "");
  const activeCardSwitchOffset = shopPurchaseOffset + INPUT_STRING_LENGTH_SIZE + shopPurchase.byteLength;
  writeLengthPrefixedString(view, bytes, activeCardSwitchOffset, activeCardSwitch);
  writeUnreliableLinkExtra(view, bytes, activeCardSwitchOffset + INPUT_STRING_LENGTH_SIZE + activeCardSwitch.byteLength, message);
}

function readInputFields(view: DataView, offset: number): Omit<Extract<ClientMessage, { type: "input_frame" }>, "type"> {
  ensureMinimumSize(view, offset + INPUT_FIXED_FIELDS_SIZE);
  const buttons = view.getUint16(offset + 10, true);
  const aimX = readLengthPrefixedString(view, offset + 12);
  const aimY = readLengthPrefixedString(view, aimX.nextOffset);
  const maybeShopPurchase = readOptionalLengthPrefixedString(view, aimY.nextOffset);
  const maybeActiveCardSwitch = readOptionalLengthPrefixedString(view, maybeShopPurchase?.nextOffset ?? aimY.nextOffset);
  const extraOffset = maybeActiveCardSwitch?.nextOffset ?? maybeShopPurchase?.nextOffset ?? aimY.nextOffset;
  const UnreliableLinkExtra = readUnreliableLinkExtra(view, extraOffset);
  if (!UnreliableLinkExtra && extraOffset !== view.byteLength) {
    throw new Error("Invalid protocol input frame size");
  }
  const transitionReadyPressed = (buttons & 64) !== 0;
  const shopReadyPressed = (buttons & 128) !== 0;
  const shopPurchaseItemId = maybeShopPurchase
    ? decoder.decode(maybeShopPurchase.value)
    : "";
  const activeCardSwitchId = maybeActiveCardSwitch
    ? decoder.decode(maybeActiveCardSwitch.value)
    : "";
  return {
    frame: view.getUint32(offset, true),
    ackFrame: view.getUint32(offset + 4, true),
    moveX: view.getInt8(offset + 8) as -1 | 0 | 1,
    moveY: view.getInt8(offset + 9) as -1 | 0 | 1,
    aimX: decodePreciseNumber(aimX.value),
    aimY: decodePreciseNumber(aimY.value),
    shootPressed: (buttons & 1) !== 0,
    bombPressed: (buttons & 2) !== 0,
    activeCardPressed: (buttons & 4) !== 0,
    reloadPressed: (buttons & 8) !== 0,
    alternateHeld: (buttons & 16) !== 0,
    infoHeld: (buttons & 32) !== 0,
    ...(transitionReadyPressed ? { transitionReadyPressed } : {}),
    ...(shopReadyPressed ? { shopReadyPressed } : {}),
    ...(shopPurchaseItemId ? { shopPurchaseItemId } : {}),
    ...(activeCardSwitchId ? { activeCardSwitchId } : {}),
    ...(UnreliableLinkExtra ? { UnreliableLinkExtra } : {}),
  };
}

function inputPayloadSize(message: Extract<ClientMessage | ServerMessage, { type: "input_frame" }>): number {
  return INPUT_FIXED_FIELDS_SIZE
    + INPUT_STRING_LENGTH_SIZE
    + encodePreciseNumber(message.aimX).byteLength
    + INPUT_STRING_LENGTH_SIZE
    + encodePreciseNumber(message.aimY).byteLength
    + INPUT_STRING_LENGTH_SIZE
    + encoder.encode(message.shopPurchaseItemId ?? "").byteLength
    + INPUT_STRING_LENGTH_SIZE
    + encoder.encode(message.activeCardSwitchId ?? "").byteLength
    + unreliableLinkExtraSize(message);
}

function unreliableLinkExtraSize(message: Extract<ClientMessage | ServerMessage, { type: "input_frame" }>): number {
  const redundantInputs = message.UnreliableLinkExtra?.redundantInputs ?? [];
  if (redundantInputs.length === 0) {
    return 0;
  }

  let size = 1;
  for (const input of redundantInputs) {
    size += REDUNDANT_INPUT_FIXED_FIELDS_SIZE
      + INPUT_STRING_LENGTH_SIZE
      + encodePreciseNumber(input.aimX).byteLength
      + INPUT_STRING_LENGTH_SIZE
      + encodePreciseNumber(input.aimY).byteLength
      + INPUT_STRING_LENGTH_SIZE
      + encoder.encode(input.shopPurchaseItemId ?? "").byteLength
      + INPUT_STRING_LENGTH_SIZE
      + encoder.encode(input.activeCardSwitchId ?? "").byteLength;
  }
  return size;
}

function writeUnreliableLinkExtra(
  view: DataView,
  target: Uint8Array,
  offset: number,
  message: Extract<ClientMessage | ServerMessage, { type: "input_frame" }>,
): void {
  const redundantInputs = message.UnreliableLinkExtra?.redundantInputs ?? [];
  if (redundantInputs.length === 0) {
    return;
  }

  if (redundantInputs.length > 0xff) {
    throw new Error("Too many redundant input frames");
  }

  view.setUint8(offset, redundantInputs.length);
  let cursor = offset + 1;
  for (const input of redundantInputs) {
    const aimX = encodePreciseNumber(input.aimX);
    const aimY = encodePreciseNumber(input.aimY);
    const shopPurchase = encoder.encode(input.shopPurchaseItemId ?? "");
    const activeCardSwitch = encoder.encode(input.activeCardSwitchId ?? "");
    view.setUint32(cursor, input.frame, true);
    view.setInt8(cursor + 4, input.moveX);
    view.setInt8(cursor + 5, input.moveY);
    view.setUint16(cursor + 6, encodeButtons(input), true);
    cursor += REDUNDANT_INPUT_FIXED_FIELDS_SIZE;
    writeLengthPrefixedString(view, target, cursor, aimX);
    cursor += INPUT_STRING_LENGTH_SIZE + aimX.byteLength;
    writeLengthPrefixedString(view, target, cursor, aimY);
    cursor += INPUT_STRING_LENGTH_SIZE + aimY.byteLength;
    writeLengthPrefixedString(view, target, cursor, shopPurchase);
    cursor += INPUT_STRING_LENGTH_SIZE + shopPurchase.byteLength;
    writeLengthPrefixedString(view, target, cursor, activeCardSwitch);
    cursor += INPUT_STRING_LENGTH_SIZE + activeCardSwitch.byteLength;
  }
}

function readUnreliableLinkExtra(
  view: DataView,
  offset: number,
): Extract<ClientMessage, { type: "input_frame" }>["UnreliableLinkExtra"] | undefined {
  if (offset === view.byteLength) {
    return undefined;
  }

  ensureMinimumSize(view, offset + 1);
  const count = view.getUint8(offset);
  let cursor = offset + 1;
  const redundantInputs: NonNullable<Extract<ClientMessage, { type: "input_frame" }>["UnreliableLinkExtra"]>["redundantInputs"][number][] = [];

  for (let index = 0; index < count; index += 1) {
    ensureMinimumSize(view, cursor + REDUNDANT_INPUT_FIXED_FIELDS_SIZE);
    const buttons = view.getUint16(cursor + 6, true);
    const aimX = readLengthPrefixedString(view, cursor + REDUNDANT_INPUT_FIXED_FIELDS_SIZE);
    const aimY = readLengthPrefixedString(view, aimX.nextOffset);
    const maybeShopPurchase = readOptionalLengthPrefixedString(view, aimY.nextOffset);
    const maybeActiveCardSwitch = readOptionalLengthPrefixedString(view, maybeShopPurchase?.nextOffset ?? aimY.nextOffset);
    const transitionReadyPressed = (buttons & 64) !== 0;
    const shopReadyPressed = (buttons & 128) !== 0;
    const shopPurchaseItemId = maybeShopPurchase
      ? decoder.decode(maybeShopPurchase.value)
      : "";
    const activeCardSwitchId = maybeActiveCardSwitch
      ? decoder.decode(maybeActiveCardSwitch.value)
      : "";
    redundantInputs.push({
      frame: view.getUint32(cursor, true),
      moveX: view.getInt8(cursor + 4) as -1 | 0 | 1,
      moveY: view.getInt8(cursor + 5) as -1 | 0 | 1,
      aimX: decodePreciseNumber(aimX.value),
      aimY: decodePreciseNumber(aimY.value),
      shootPressed: (buttons & 1) !== 0,
      bombPressed: (buttons & 2) !== 0,
      activeCardPressed: (buttons & 4) !== 0,
      reloadPressed: (buttons & 8) !== 0,
      alternateHeld: (buttons & 16) !== 0,
      infoHeld: (buttons & 32) !== 0,
      ...(transitionReadyPressed ? { transitionReadyPressed } : {}),
      ...(shopReadyPressed ? { shopReadyPressed } : {}),
      ...(shopPurchaseItemId ? { shopPurchaseItemId } : {}),
      ...(activeCardSwitchId ? { activeCardSwitchId } : {}),
    });
    cursor = maybeActiveCardSwitch?.nextOffset ?? maybeShopPurchase?.nextOffset ?? aimY.nextOffset;
  }

  if (cursor !== view.byteLength) {
    throw new Error("Invalid protocol input frame size");
  }

  return redundantInputs.length > 0 ? { redundantInputs } : undefined;
}

function encodePreciseNumber(value: number): Uint8Array {
  const text = Number.isFinite(value) ? value.toString() : "0";
  return encoder.encode(text);
}

function decodePreciseNumber(bytes: Uint8Array): number {
  const text = decoder.decode(bytes);
  fp.fromString(text);
  return Number(text);
}

function writeLengthPrefixedString(
  view: DataView,
  target: Uint8Array,
  offset: number,
  value: Uint8Array,
): void {
  if (value.byteLength > 0xffff) {
    throw new Error("Protocol string field is too large");
  }
  ensureMinimumSize(view, offset + INPUT_STRING_LENGTH_SIZE + value.byteLength);
  view.setUint16(offset, value.byteLength, true);
  target.set(value, offset + INPUT_STRING_LENGTH_SIZE);
}

function readLengthPrefixedString(view: DataView, offset: number): { readonly value: Uint8Array; readonly nextOffset: number } {
  ensureMinimumSize(view, offset + INPUT_STRING_LENGTH_SIZE);
  const length = view.getUint16(offset, true);
  const start = offset + INPUT_STRING_LENGTH_SIZE;
  const end = start + length;
  ensureMinimumSize(view, end);
  return {
    value: new Uint8Array(view.buffer, view.byteOffset + start, length),
    nextOffset: end,
  };
}

function readOptionalLengthPrefixedString(
  view: DataView,
  offset: number,
): { readonly value: Uint8Array; readonly nextOffset: number } | undefined {
  if (offset === view.byteLength) {
    return undefined;
  }
  return readLengthPrefixedString(view, offset);
}

function encodeButtons(message: {
  readonly shootPressed: boolean;
  readonly bombPressed: boolean;
  readonly activeCardPressed: boolean;
  readonly reloadPressed: boolean;
  readonly alternateHeld: boolean;
  readonly infoHeld: boolean;
  readonly transitionReadyPressed?: boolean;
  readonly shopReadyPressed?: boolean;
  readonly shopPurchaseItemId?: string;
}): number {
  return (message.shootPressed ? 1 : 0)
    | (message.bombPressed ? 2 : 0)
    | (message.activeCardPressed ? 4 : 0)
    | (message.reloadPressed ? 8 : 0)
    | (message.alternateHeld ? 16 : 0)
    | (message.infoHeld ? 32 : 0)
    | (message.transitionReadyPressed ? 64 : 0)
    | (message.shopReadyPressed ? 128 : 0);
}

function encodePlayerId(playerId: "Player1" | "Player2" | "Neutral"): number {
  if (playerId === "Player1") return 1;
  if (playerId === "Player2") return 2;
  return 0;
}

function decodePlayerId(value: number): "Player1" | "Player2" | "Neutral" {
  if (value === 1) return "Player1";
  if (value === 2) return "Player2";
  return "Neutral";
}

function writeHeader(bytes: Uint8Array, code: number): void {
  bytes[0] = VERSION;
  bytes[1] = code;
}

function dataViewFor(bytes: Uint8Array): DataView {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

function ensureSize(view: DataView, size: number): void {
  if (view.byteLength !== size) {
    throw new Error("Invalid protocol message size");
  }
}

function ensureMinimumSize(view: DataView, size: number): void {
  if (view.byteLength < size) {
    throw new Error("Invalid protocol message size");
  }
}

function toUint8Array(data: unknown): Uint8Array | undefined {
  if (data instanceof Uint8Array) {
    return data;
  }
  if (data instanceof ArrayBuffer) {
    return new Uint8Array(data);
  }
  if (ArrayBuffer.isView(data)) {
    return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  }
  return undefined;
}

function parseJson(raw: string): unknown | undefined {
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}
