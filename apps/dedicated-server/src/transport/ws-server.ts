import { WebSocketServer, WebSocket } from "ws";
import type { ServerMessage } from "../protocol/messages";
import type { TransportConnection, TransportServer } from "./interface";

let nextConnectionId = 0;

class WsConnection implements TransportConnection {
  public readonly id: string;
  private msgHandlers: Array<(message: unknown) => void> = [];
  private closeHandlers: Array<() => void> = [];
  private errorHandlers: Array<(error: Error) => void> = [];

  constructor(public ws: WebSocket) {
    this.id = `conn_${nextConnectionId++}`;

    ws.on("message", (data) => {
      try {
        const parsed = JSON.parse(data.toString());
        this.msgHandlers.forEach((h) => h(parsed));
      } catch {
        // ignore malformed messages
      }
    });

    ws.on("close", () => {
      this.closeHandlers.forEach((h) => h());
    });

    ws.on("error", (err) => {
      this.errorHandlers.forEach((h) => h(err));
    });
  }

  send(message: ServerMessage): void {
    if (this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }

  close(code?: number, reason?: string): void {
    this.ws.close(code, reason);
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
}

export class WsTransportServer implements TransportServer {
  private wss: WebSocketServer;
  private connHandlers: Array<(conn: TransportConnection) => void> = [];

  constructor(port: number, host: string) {
    this.wss = new WebSocketServer({ port, host });

    this.wss.on("connection", (ws) => {
      const conn = new WsConnection(ws);
      this.connHandlers.forEach((h) => h(conn));
    });
  }

  onConnection(handler: (conn: TransportConnection) => void): void {
    this.connHandlers.push(handler);
  }

  broadcast(message: ServerMessage): void {
    const data = JSON.stringify(message);
    this.wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(data);
      }
    });
  }

  close(): void {
    this.wss.close();
  }
}
