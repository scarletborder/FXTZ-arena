import type { ClientMessage, ServerMessage } from "@repo/types";

export type NetworkTransportReadyState = "connecting" | "open" | "closed";

export interface NetworkTransportHandlers {
  readonly open: () => void;
  readonly close: () => void;
  readonly error: (error: Error) => void;
  readonly message: (message: ServerMessage) => void;
}

export abstract class BaseNetworkTransport {
  protected readonly encoder = new TextEncoder();
  protected readonly decoder = new TextDecoder();

  abstract readonly address: string;
  abstract readyState: NetworkTransportReadyState;
  abstract open(): void;
  abstract send(message: ClientMessage): void;
  abstract close(): void;

  constructor(protected readonly handlers: NetworkTransportHandlers) {}

  protected serialize(message: ClientMessage): string {
    return JSON.stringify(message);
  }

  protected emitJsonMessage(raw: string): void {
    try {
      this.handlers.message(JSON.parse(raw) as ServerMessage);
    } catch {
      // Ignore malformed messages.
    }
  }

  protected asError(error: unknown): Error {
    return error instanceof Error ? error : new Error(String(error));
  }
}
