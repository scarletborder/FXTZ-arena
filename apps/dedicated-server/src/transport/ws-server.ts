import { createServer, type IncomingMessage, type Server as HttpServer, type ServerResponse } from "node:http";
import { createServer as createSecureServer, type Server as HttpsServer } from "node:https";
import { WebSocketServer, WebSocket } from "ws";
import { decodeProtocolMessage, encodeProtocolMessage } from "@repo/types";
import type { ServerMessage } from "../protocol/messages";
import type { TransportConnection, TransportServer } from "./interface";

let nextConnectionId = 0;

type NodeServer = HttpServer | HttpsServer;

interface HttpMetadata {
  readonly fingerprint?: string;
  readonly webTransportEnabled: boolean;
  readonly version?: string;
  readonly collaborateEnabled?: boolean;
}

export interface WsTransportTlsOptions {
  readonly cert: Buffer | string;
  readonly key: Buffer | string;
}

function handleHttpRequest(req: IncomingMessage, res: ServerResponse, meta: HttpMetadata): void {
  const path = new URL(req.url ?? "/", "http://localhost").pathname;
  if (req.method === "GET" && path === "/fingerprint") {
    if (!meta.webTransportEnabled || !meta.fingerprint) {
      res.writeHead(404, {
        "content-type": "text/plain; charset=utf-8",
        "cache-control": "no-store",
      });
      res.end("Not found\n");
      return;
    }
    res.writeHead(200, {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store",
    });
    res.end(`${meta.fingerprint}\n`);
    return;
  }
  if (req.method === "GET" && path === "/version") {
    res.writeHead(200, {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "access-control-allow-origin": "*",
    });
    res.end(JSON.stringify({
      version: meta.version ?? "unknown",
      webTransport: meta.webTransportEnabled,
      collaborate: meta.collaborateEnabled === true,
    }));
    return;
  }
  if (req.method === "GET" && path === "/echo") {
    res.writeHead(200, {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
    });
    res.end(`
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <style>
        body {
          font-size: 48px;
          font-family: Arial, sans-serif;
          text-align: center;
          padding: 50px;
        }
        .chinese {
          font-size: 52px;
          font-weight: bold;
          margin-bottom: 30px;
        }
        .english {
          font-size: 40px;
          color: #555;
        }
        .server-info {
          font-size: 36px;
          margin-bottom: 50px;
          color: #2c3e66;
        }
      </style>
    </head>
    <body>
      <div class="server-info">FXTZ arena dedicated server echo ok</div>
      <div class="chinese">你已信任证书，现在可以关闭此网页</div>
      <div class="english">You have trusted the certificate, you can now close this page</div>
    </body>
    </html>
  `);
    return;
  }

  res.writeHead(404, {
    "content-type": "text/plain; charset=utf-8",
    "cache-control": "no-store",
  });
  res.end("Not found\n");
}

class WsConnection implements TransportConnection {
  public readonly id: string;
  private msgHandlers: Array<(message: unknown) => void> = [];
  private closeHandlers: Array<() => void> = [];
  private errorHandlers: Array<(error: Error) => void> = [];

  constructor(public ws: WebSocket) {
    this.id = `conn_${nextConnectionId++}`;

    ws.on("message", (data) => {
      const parsed = decodeProtocolMessage(data);
      if (parsed) {
        this.msgHandlers.forEach((h) => h(parsed));
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
      this.ws.send(encodeProtocolMessage(message));
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
  private httpServers: NodeServer[];
  private servers: WebSocketServer[];
  private connHandlers: Array<(conn: TransportConnection) => void> = [];

  constructor(
    port: number,
    hosts: readonly string[],
    tls?: WsTransportTlsOptions,
    meta: HttpMetadata = { webTransportEnabled: false },
  ) {
    this.httpServers = hosts.map((host) => {
      const handler = (req: IncomingMessage, res: ServerResponse) => handleHttpRequest(req, res, meta);
      const httpServer = tls ? createSecureServer(tls, handler) : createServer(handler);
      httpServer.listen({
        host,
        port,
        ipv6Only: host.includes(":"),
      });
      return httpServer;
    });

    this.servers = this.httpServers.map((httpServer) => {
      const server = new WebSocketServer({ server: httpServer });
      server.on("connection", (ws) => {
        const conn = new WsConnection(ws);
        this.connHandlers.forEach((h) => h(conn));
      });

      return server;
    });
  }

  onConnection(handler: (conn: TransportConnection) => void): void {
    this.connHandlers.push(handler);
  }

  broadcast(message: ServerMessage): void {
    const data = encodeProtocolMessage(message);
    this.servers.forEach((server) => {
      server.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(data);
        }
      });
    });
  }

  close(): void {
    this.servers.forEach((server) => server.close());
    this.httpServers.forEach((server) => server.close());
  }
}
