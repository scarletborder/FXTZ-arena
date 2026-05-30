import { randomBytes } from "node:crypto";

import { encodeProtocolStreamPacket, ProtocolStreamDecoder } from "@repo/types";
import type { ServerMessage } from "../protocol/messages";
import type { TransportConnection, TransportServer } from "./interface";
import type { WsTransportTlsOptions } from "./ws-server";

let nextConnectionId = 0;

interface WebTransportBidirectionalStreamLike {
  readonly readable: ReadableStream<Uint8Array>;
  readonly writable: WritableStream<Uint8Array>;
}

interface WebTransportSessionLike {
  readonly ready: Promise<void>;
  readonly closed: Promise<unknown>;
  readonly incomingBidirectionalStreams: ReadableStream<WebTransportBidirectionalStreamLike>;
  close(closeInfo?: { closeCode: number; reason: string }): void;
}

interface Http3ServerLike {
  readonly ready: Promise<unknown>;
  startServer(): void;
  stopServer(): void;
  sessionStream(path: string): ReadableStream<WebTransportSessionLike>;
}

interface Http3ServerConstructor {
  new(args: {
    port: number;
    host: string;
    secret: string;
    cert: string;
    privKey: string;
    defaultDatagramsReadableMode: "bytes";
    quicheNodeSocketOptions?: { ipv6Only?: boolean };
  }): Http3ServerLike;
}

interface WebTransportModule {
  readonly Http3Server: Http3ServerConstructor;
}

export class WtConnection implements TransportConnection {
  public readonly id: string;
  private readonly pending: Uint8Array[] = [];
  private readonly streamDecoder = new ProtocolStreamDecoder();
  private writer: WritableStreamDefaultWriter<Uint8Array> | null = null;
  private writeQueue: Promise<void> = Promise.resolve();
  private closing = false;
  private closeEmitted = false;
  private msgHandlers: Array<(message: unknown) => void> = [];
  private closeHandlers: Array<() => void> = [];
  private errorHandlers: Array<(error: Error) => void> = [];

  constructor(private readonly session: WebTransportSessionLike) {
    this.id = `wt_conn_${nextConnectionId++}`;
    void this.acceptMessageStream();
    void session.closed.then(
      () => this.emitClose(),
      (error: unknown) => {
        this.emitError(asError(error));
        this.emitClose();
      },
    );
  }

  send(message: ServerMessage): void {
    const data = encodeProtocolStreamPacket(message);
    if (!this.writer) {
      this.pending.push(data);
      return;
    }
    this.enqueueWrite(data);
  }

  close(code?: number, reason?: string): void {
    this.closing = true;
    try {
      this.session.close({ closeCode: code ?? 0, reason: reason ?? "" });
    } catch (error) {
      this.emitError(asError(error));
    }
    this.emitClose();
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

  private async acceptMessageStream(): Promise<void> {
    try {
      await this.session.ready;
      const reader = this.session.incomingBidirectionalStreams.getReader();
      const result = await reader.read();
      reader.releaseLock();
      if (result.done || !result.value) {
        this.close(1002, "message stream missing");
        return;
      }

      this.attachMessageStream(result.value);
    } catch (error) {
      this.emitError(asError(error));
      this.emitClose();
    }
  }

  private attachMessageStream(stream: WebTransportBidirectionalStreamLike): void {
    this.writer = stream.writable.getWriter();
    while (this.pending.length > 0) {
      const data = this.pending.shift();
      if (data) {
        this.enqueueWrite(data);
      }
    }
    void this.readLoop(stream.readable.getReader());
  }

  private enqueueWrite(data: Uint8Array): void {
    const writer = this.writer;
    if (!writer || this.closing) {
      return;
    }

    this.writeQueue = this.writeQueue
      .then(() => writer.write(data))
      .catch((error: unknown) => {
        this.emitError(asError(error));
        this.emitClose();
      });
  }

  private async readLoop(reader: ReadableStreamDefaultReader<Uint8Array>): Promise<void> {
    try {
      while (!this.closing) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }
        if (value) {
          this.consumeBytes(value);
        }
      }
      this.emitClose();
    } catch (error) {
      this.emitError(asError(error));
      this.emitClose();
    } finally {
      reader.releaseLock();
    }
  }

  private consumeBytes(bytes: Uint8Array): void {
    for (const message of this.streamDecoder.push(bytes)) {
      this.msgHandlers.forEach((handler) => handler(message));
    }
  }

  private emitClose(): void {
    if (this.closeEmitted) {
      return;
    }
    this.closeEmitted = true;
    this.closing = true;
    this.closeHandlers.forEach((handler) => handler());
  }

  private emitError(error: Error): void {
    this.errorHandlers.forEach((handler) => handler(error));
  }
}

export class WtTransportServer implements TransportServer {
  private readonly connHandlers: Array<(conn: TransportConnection) => void> = [];
  private readonly connections = new Set<WtConnection>();
  private readonly servers: Http3ServerLike[] = [];
  private closed = false;

  constructor(
    private readonly port: number,
    private readonly hosts: readonly string[],
    private readonly tls: WsTransportTlsOptions,
  ) {
    void this.start().catch((error: unknown) => {
      console.error("Failed to start WebTransport /wt server", error);
    });
  }

  onConnection(handler: (conn: TransportConnection) => void): void {
    this.connHandlers.push(handler);
  }

  broadcast(message: ServerMessage): void {
    this.connections.forEach((connection) => connection.send(message));
  }

  close(): void {
    this.closed = true;
    this.connections.forEach((connection) => connection.close(1001, "server shutdown"));
    this.servers.forEach((server) => server.stopServer());
  }

  private async start(): Promise<void> {
    const moduleName = "@fails-components/webtransport";
    const { Http3Server: Http3ServerCtor } = await import(moduleName) as WebTransportModule;

    for (const host of this.hosts) {
      if (this.closed) {
        return;
      }

      const server = new Http3ServerCtor({
        port: this.port,
        host,
        secret: randomBytes(32).toString("hex"),
        cert: this.tls.cert.toString(),
        privKey: this.tls.key.toString(),
        defaultDatagramsReadableMode: "bytes",
        quicheNodeSocketOptions: {
          ipv6Only: host.includes(":"),
        },
      });
      this.servers.push(server);
      void this.acceptSessions(server);
      server.startServer();
      void server.ready.catch((error: unknown) => {
        console.error(`WebTransport /wt failed on ${host}:${this.port}`, error);
      });
    }
  }

  private async acceptSessions(server: Http3ServerLike): Promise<void> {
    const stream = server.sessionStream("/wt");
    const reader = stream.getReader();
    try {
      while (!this.closed) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }
        if (!value) {
          continue;
        }
        const conn = new WtConnection(value);
        this.connections.add(conn);
        conn.onClose(() => this.connections.delete(conn));
        this.connHandlers.forEach((handler) => handler(conn));
      }
    } catch (error) {
      if (!this.closed) {
        console.error("WebTransport /wt session stream failed", error);
      }
    } finally {
      reader.releaseLock();
    }
  }
}

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}
