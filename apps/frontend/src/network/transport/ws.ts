import type { ClientMessage } from "@repo/types";

import { BaseNetworkTransport, type NetworkTransportHandlers, type NetworkTransportReadyState } from "./base";

export class WsNetworkTransport extends BaseNetworkTransport {
  readyState: NetworkTransportReadyState = "connecting";
  private ws: WebSocket | null = null;

  constructor(
    readonly address: string,
    handlers: NetworkTransportHandlers,
  ) {
    super(handlers);
  }

  open(): void {
    try {
      this.ws = new WebSocket(this.address);
    } catch (error) {
      this.readyState = "closed";
      this.handlers.error(this.asError(error));
      return;
    }

    this.ws.onopen = () => {
      this.readyState = "open";
      this.handlers.open();
    };
    this.ws.onclose = () => {
      this.readyState = "closed";
      this.handlers.close();
    };
    this.ws.onerror = () => {
      this.handlers.error(new Error("WebSocket connection error"));
    };
    this.ws.onmessage = (event: MessageEvent) => {
      this.emitJsonMessage(String(event.data));
    };
  }

  send(message: ClientMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(this.serialize(message));
    }
  }

  close(): void {
    this.ws?.close();
    this.ws = null;
    this.readyState = "closed";
  }
}
