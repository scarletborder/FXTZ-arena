import type { ServerMessage } from "../protocol/messages";

/**
 * Abstract connection representing a single connected client.
 */
export interface TransportConnection {
  readonly id: string;
  send(message: ServerMessage): void;
  close(code?: number, reason?: string): void;
  onMessage(handler: (message: unknown) => void): void;
  onClose(handler: () => void): void;
  onError(handler: (error: Error) => void): void;
}

/**
 * Abstract transport server that accepts connections.
 */
export interface TransportServer {
  onConnection(handler: (conn: TransportConnection) => void): void;
  broadcast(message: ServerMessage): void;
  close(): void;
}
