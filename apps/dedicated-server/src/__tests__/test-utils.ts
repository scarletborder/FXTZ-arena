import type { ServerMessage } from "../protocol/messages";
import type { TransportConnection, TransportServer } from "../transport/interface";

let nextMockId = 0;

export class MockConnection implements TransportConnection {
  public readonly id: string;
  public sentMessages: ServerMessage[] = [];
  public closed = false;
  public closeCode: number | undefined;
  public closeReason: string | undefined;

  private msgHandlers: Array<(message: unknown) => void> = [];
  private closeHandlers: Array<() => void> = [];
  private errorHandlers: Array<(error: Error) => void> = [];

  constructor(id?: string) {
    this.id = id ?? `mock_conn_${nextMockId++}`;
  }

  send(message: ServerMessage): void {
    this.sentMessages.push(message);
  }

  close(code?: number, reason?: string): void {
    this.closed = true;
    this.closeCode = code;
    this.closeReason = reason;
    this.closeHandlers.forEach((h) => h());
  }

  onMessage(handler: (message: unknown) => void): void {
    this.msgHandlers.push(handler);
  }

  onClose(handler: () => void): void {
    this.closeHandlers.push(handler);
  }

  onError(handler: (error: Error) => void): void {
    this.errorHandlers.push(handler);
  }

  /** Simulate receiving a message from the client side. */
  receive(msg: unknown): void {
    this.msgHandlers.forEach((h) => h(msg));
  }

  /** Simulate an error. */
  emitError(error: Error): void {
    this.errorHandlers.forEach((h) => h(error));
  }

  /** Get the last sent message of a specific type. */
  findSentMessage<T extends ServerMessage["type"]>(
    type: T,
  ): Extract<ServerMessage, { type: T }> | undefined {
    return this.sentMessages.find(
      (m) => m.type === type,
    ) as Extract<ServerMessage, { type: T }> | undefined;
  }

  /** Get all sent messages of a specific type. */
  findAllSentMessages<T extends ServerMessage["type"]>(
    type: T,
  ): Extract<ServerMessage, { type: T }>[] {
    return this.sentMessages.filter(
      (m) => m.type === type,
    ) as Extract<ServerMessage, { type: T }>[];
  }

  /** Clear sent messages. */
  clearMessages(): void {
    this.sentMessages = [];
  }
}

export class MockTransportServer implements TransportServer {
  private connHandlers: Array<(conn: TransportConnection) => void> = [];

  onConnection(handler: (conn: TransportConnection) => void): void {
    this.connHandlers.push(handler);
  }

  /** Simulate a new client connection. */
  createConnection(id?: string): MockConnection {
    const conn = new MockConnection(id);
    this.connHandlers.forEach((h) => h(conn));
    return conn;
  }

  broadcast(message: ServerMessage): void {
    // No-op in mock
  }

  close(): void {
    // No-op in mock
  }
}
