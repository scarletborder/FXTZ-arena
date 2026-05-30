import { decodeProtocolMessage, encodeProtocolMessage } from "@repo/types";
import type { ClientMessage, ServerMessage } from "@repo/types";

export type NetworkTransportReadyState = "connecting" | "open" | "closed";

export interface NetworkTransportHandlers {
  readonly open: () => void;
  readonly close: () => void;
  readonly error: (error: Error) => void;
  readonly message: (message: ServerMessage) => void;
}

export abstract class BaseNetworkTransport {
  abstract readonly address: string;
  abstract readyState: NetworkTransportReadyState;
  abstract open(): void;
  abstract send(message: ClientMessage): void;
  abstract close(): void;

  constructor(protected readonly handlers: NetworkTransportHandlers) {}

  protected serialize(message: ClientMessage): Uint8Array {
    return encodeProtocolMessage(message);
  }

  protected emitProtocolMessage(data: unknown): void {
    const message = isProtocolObject(data) ? data : decodeProtocolMessage(data);
    if (message) {
      this.handlers.message(message as ServerMessage);
    }
  }

  protected asError(error: unknown): Error {
    return error instanceof Error ? error : new Error(String(error));
  }
}

function isProtocolObject(value: unknown): value is ClientMessage | ServerMessage {
  return typeof value === "object"
    && value !== null
    && "type" in value
    && typeof value.type === "string";
}
