import { encodeProtocolStreamPacket, ProtocolStreamDecoder } from "@repo/types";
import type { ClientMessage } from "@repo/types";
import { IS_DESKTOP_APP } from "@repo/constants";

import { BaseNetworkTransport, type NetworkTransportHandlers, type NetworkTransportReadyState } from "./base";

type UnlistenFn = () => void;

interface TauriCoreApi {
  invoke<T>(command: string, args?: Record<string, unknown>): Promise<T>;
}

interface TauriEventApi {
  listen<T>(event: string, handler: (event: { payload: T }) => void): Promise<UnlistenFn>;
}

interface WtPayload {
  readonly data: number[];
}

async function loadTauri(): Promise<{ core: TauriCoreApi; event: TauriEventApi }> {
  if (!IS_DESKTOP_APP) {
    throw new Error("WebTransport proxy is only available in the desktop client");
  }

  const [core, event] = await Promise.all([
    import("@tauri-apps/api/core") as Promise<TauriCoreApi>,
    import("@tauri-apps/api/event") as Promise<TauriEventApi>,
  ]);
  return { core, event };
}

export class WtDesktopTransport extends BaseNetworkTransport {
  readyState: NetworkTransportReadyState = "connecting";
  private writerReady = false;
  private closeEmitted = false;
  private streamDecoder = new ProtocolStreamDecoder();
  private unlistenFns: UnlistenFn[] = [];
  private core: TauriCoreApi | null = null;

  constructor(
    readonly address: string,
    handlers: NetworkTransportHandlers,
  ) {
    super(handlers);
  }

  open(): void {
    void this.openInternal();
  }

  private async openInternal(): Promise<void> {
    try {
      const { core, event } = await loadTauri();
      this.core = core;

      this.unlistenFns.push(await event.listen("wt-open", () => {
        this.writerReady = true;
        this.readyState = "open";
        this.handlers.open();
      }));

      this.unlistenFns.push(await event.listen<string>("wt-error", ({ payload }) => {
        this.handlers.error(new Error(payload));
        this.emitClose();
      }));

      this.unlistenFns.push(await event.listen("wt-close", () => {
        this.emitClose();
      }));

      this.unlistenFns.push(await event.listen<WtPayload>("wt-receive", ({ payload }) => {
        this.consumeBytes(new Uint8Array(payload.data));
      }));

      await core.invoke("wt_connect", { url: this.address });
    } catch (error) {
      this.readyState = "closed";
      this.handlers.error(this.asError(error));
      this.emitClose();
    }
  }

  send(message: ClientMessage): void {
    if (!this.core || !this.writerReady || this.readyState !== "open") {
      return;
    }
    const data = encodeProtocolStreamPacket(message);
    void this.core.invoke("wt_send", { data: Array.from(data) });
  }

  close(): void {
    void this.core?.invoke("wt_close");
    this.emitClose();
  }

  private consumeBytes(bytes: Uint8Array): void {
    for (const message of this.streamDecoder.push(bytes)) {
      this.emitProtocolMessage(message);
    }
  }

  private emitClose(): void {
    if (this.closeEmitted) {
      return;
    }
    this.closeEmitted = true;
    this.readyState = "closed";
    this.handlers.close();
    this.unlistenFns.forEach((unlisten) => unlisten());
    this.unlistenFns = [];
  }
}
