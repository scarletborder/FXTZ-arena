import type { ClientMessage } from "@repo/types";

import { certificateFingerprintToArrayBuffer } from "../fingerprint";
import { BaseNetworkTransport, type NetworkTransportHandlers, type NetworkTransportReadyState } from "./base";

interface WebTransportBidirectionalStreamLike {
  readonly readable: ReadableStream<Uint8Array>;
  readonly writable: WritableStream<Uint8Array>;
}

interface WebTransportSessionLike {
  readonly ready: Promise<void>;
  readonly closed: Promise<unknown>;
  createBidirectionalStream(): Promise<WebTransportBidirectionalStreamLike>;
  close(closeInfo?: { closeCode: number; reason: string }): void;
}

interface WebTransportOptionsLike {
  readonly serverCertificateHashes?: readonly {
    readonly algorithm: "sha-256";
    readonly value: ArrayBuffer;
  }[];
}

type WebTransportConstructor = new (url: string, options?: WebTransportOptionsLike) => WebTransportSessionLike;

export class WtNetworkTransport extends BaseNetworkTransport {
  readyState: NetworkTransportReadyState = "connecting";
  private transport: WebTransportSessionLike | null = null;
  private writer: WritableStreamDefaultWriter<Uint8Array> | null = null;
  private writeQueue: Promise<void> = Promise.resolve();
  private readBuffer = "";
  private closeEmitted = false;

  constructor(
    readonly address: string,
    handlers: NetworkTransportHandlers,
    private readonly certificateFingerprint?: string,
  ) {
    super(handlers);
  }

  open(): void {
    const ctor = (globalThis as typeof globalThis & { WebTransport?: WebTransportConstructor }).WebTransport;
    if (!ctor) {
      this.readyState = "closed";
      this.handlers.error(new Error("This browser does not support WebTransport."));
      this.emitClose();
      return;
    }

    try {
      this.transport = new ctor(this.address, this.createOptions());
    } catch (error) {
      this.readyState = "closed";
      this.handlers.error(this.asError(error));
      this.emitClose();
      return;
    }

    void this.openMessageStream();
    void this.transport.closed.then(
      () => this.emitClose(),
      (error: unknown) => {
        this.handlers.error(this.asError(error));
        this.emitClose();
      },
    );
  }

  private createOptions(): WebTransportOptionsLike | undefined {
    if (!this.certificateFingerprint) {
      return undefined;
    }

    return {
      serverCertificateHashes: [
        {
          algorithm: "sha-256",
          value: certificateFingerprintToArrayBuffer(this.certificateFingerprint),
        },
      ],
    };
  }

  send(message: ClientMessage): void {
    if (!this.writer || this.readyState !== "open") {
      return;
    }
    const data = this.encoder.encode(`${this.serialize(message)}\n`);
    this.writeQueue = this.writeQueue
      .then(() => this.writer?.write(data))
      .then(() => undefined)
      .catch((error: unknown) => {
        this.handlers.error(this.asError(error));
        this.emitClose();
      });
  }

  close(): void {
    try {
      this.writer?.close().catch(() => undefined);
      this.transport?.close({ closeCode: 0, reason: "client close" });
    } catch {
      // Closing is best-effort.
    }
    this.readyState = "closed";
    this.emitClose();
  }

  private async openMessageStream(): Promise<void> {
    try {
      const transport = this.transport;
      if (!transport) {
        return;
      }

      await transport.ready;
      const stream = await transport.createBidirectionalStream();
      this.writer = stream.writable.getWriter();
      this.readyState = "open";
      this.handlers.open();
      void this.readLoop(stream.readable.getReader());
    } catch (error) {
      this.handlers.error(this.asError(error));
      this.emitClose();
    }
  }

  private async readLoop(reader: ReadableStreamDefaultReader<Uint8Array>): Promise<void> {
    try {
      while (this.readyState === "open") {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }
        if (value) {
          this.consumeText(this.decoder.decode(value, { stream: true }));
        }
      }
      this.consumeText(this.decoder.decode());
      this.flushBufferedMessage();
      this.emitClose();
    } catch (error) {
      this.handlers.error(this.asError(error));
      this.emitClose();
    } finally {
      reader.releaseLock();
    }
  }

  private consumeText(text: string): void {
    this.readBuffer += text;
    while (true) {
      const newline = this.readBuffer.indexOf("\n");
      if (newline === -1) {
        return;
      }
      const line = this.readBuffer.slice(0, newline).trim();
      this.readBuffer = this.readBuffer.slice(newline + 1);
      this.emitJsonLine(line);
    }
  }

  private flushBufferedMessage(): void {
    const line = this.readBuffer.trim();
    this.readBuffer = "";
    this.emitJsonLine(line);
  }

  private emitJsonLine(line: string): void {
    if (line) {
      this.emitJsonMessage(line);
    }
  }

  private emitClose(): void {
    if (this.closeEmitted) {
      return;
    }
    this.closeEmitted = true;
    this.readyState = "closed";
    this.handlers.close();
  }
}
