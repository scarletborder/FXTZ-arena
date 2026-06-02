import { APP_BUILD_LABEL } from "@repo/constants";
import type { ClientMessage, InputFrameMessage, PlayerId, PlayerLoadout, ServerMessage } from "@repo/types";

import type { ConnectionManager } from "./client";
import { listenUdp, sendUdp, stopUdp, subscribeUdp } from "./desktop-udp";
import { type ClientInfo, PeerDeviceType } from "./local-lan/services/signaling";
import type { PeerConnection, P2pStatus } from "./p2p";

export interface UdpDirectSessionCallbacks {
  readonly onMatch?: (peer: ClientInfo) => void;
  readonly onBattleReady?: (peer: ClientInfo, loadout: PlayerLoadout) => void;
  readonly onPacket?: (addr: string) => void;
}

type UdpPayload =
  | {
    kind: "hello";
    client: ClientInfo;
  }
  | {
    kind: "welcome";
    client: ClientInfo;
  }
  | {
    kind: "p2p_packet";
    message: ServerMessage;
  }
  | {
    kind: "battle_ready";
    loadout: PlayerLoadout;
  };

export class UdpDirectSession {
  private unlisten: (() => void) | null = null;
  private client: ClientInfo | null = null;
  private peer: ClientInfo | null = null;
  private peerAddr: string | null = null;
  private peerPacketHandler: ((message: ServerMessage) => void) | null = null;

  constructor(
    private readonly role: "host" | "guest",
    private readonly callbacks: UdpDirectSessionCallbacks = {},
  ) { }

  get currentClient(): ClientInfo | null {
    return this.client;
  }

  get currentPeer(): ClientInfo | null {
    return this.peer;
  }

  async host(port: number, username: string): Promise<string> {
    this.client = this.createClientInfo(username);
    const addr = await listenUdp(port);
    this.unlisten?.();
    this.unlisten = await subscribeUdp((packet) => this.handlePacket(packet.addr, packet.data));
    return addr;
  }

  async connect(addr: string, username: string): Promise<void> {
    this.client = this.createClientInfo(username);
    this.peerAddr = addr;
    await listenUdp(0);
    this.unlisten?.();
    this.unlisten = await subscribeUdp((packet) => this.handlePacket(packet.addr, packet.data));
    await this.sendPayload({ kind: "hello", client: this.client });
  }

  close(): void {
    this.unlisten?.();
    this.unlisten = null;
    this.peerPacketHandler = null;
    this.peer = null;
    this.peerAddr = null;
    this.client = null;
    void stopUdp().catch(() => undefined);
  }

  setPeerPacketHandler(handler: ((message: ServerMessage) => void) | null): void {
    this.peerPacketHandler = handler;
  }

  createP2pBridge(localPlayerId: PlayerId): Pick<ConnectionManager, "send"> {
    return {
      send: (message) => this.sendPeerPacket(localPlayerId, message),
    };
  }

  createDirectPeer(localPlayerId: PlayerId): PeerConnection {
    return new UdpDirectPeerConnection(this, localPlayerId);
  }

  sendBattleReady(loadout: PlayerLoadout): void {
    void this.sendPayload({ kind: "battle_ready", loadout });
  }

  private async handlePacket(addr: string, data: Uint8Array): Promise<void> {
    this.callbacks.onPacket?.(addr);
    const payload = this.decodePayload(data);
    if (!payload || !this.client) {
      return;
    }

    if (payload.kind === "hello" && this.role === "host") {
      this.peer = payload.client;
      this.peerAddr = addr;
      await this.sendPayload({ kind: "welcome", client: this.client });
      this.callbacks.onMatch?.(this.peer);
      return;
    }

    if (payload.kind === "welcome" && this.role === "guest") {
      this.peer = payload.client;
      this.peerAddr = addr;
      this.callbacks.onMatch?.(this.peer);
      return;
    }

    if (!this.peer) {
      return;
    }

    if (payload.kind === "p2p_packet") {
      this.peerPacketHandler?.(payload.message);
      return;
    }

    if (payload.kind === "battle_ready") {
      this.callbacks.onBattleReady?.(this.peer, payload.loadout);
    }
  }

  sendPeerPacket(localPlayerId: PlayerId, message: ClientMessage): boolean {
    const packet = this.clientMessageToServerMessage(localPlayerId, message);
    if (!packet) {
      return false;
    }
    void this.sendPayload({ kind: "p2p_packet", message: packet });
    return true;
  }

  private async sendPayload(payload: UdpPayload): Promise<void> {
    if (!this.peerAddr) {
      return;
    }
    await sendUdp(this.peerAddr, new TextEncoder().encode(JSON.stringify(payload)));
  }

  private decodePayload(data: Uint8Array): UdpPayload | null {
    try {
      const payload = JSON.parse(new TextDecoder().decode(data)) as UdpPayload;
      if (!payload || typeof payload !== "object" || !("kind" in payload)) {
        return null;
      }
      return payload;
    } catch {
      return null;
    }
  }

  private clientMessageToServerMessage(playerId: PlayerId, message: ClientMessage): ServerMessage | null {
    switch (message.type) {
      case "p2p_intent":
        return {
          type: "peer_p2p_intent",
          playerId,
          enabled: message.enabled,
        };
      case "p2p_signal":
        return {
          type: "peer_p2p_signal",
          playerId,
          signal: message.signal,
        };
      case "p2p_ready":
        return {
          type: "peer_p2p_ready",
          playerId,
        };
      case "loading_done":
        return {
          type: "peer_loading_done",
          playerId,
        };
      case "input_frame": {
        const inputFrame = message as InputFrameMessage;
        return {
          ...inputFrame,
          playerId,
        };
      }
      case "game_over":
        return {
          type: "peer_game_over",
          playerId,
          frame: message.frame,
          ackFrame: message.ackFrame,
          winnerPlayerId: message.winnerPlayerId,
        };
      default:
        return null;
    }
  }

  private createClientInfo(username: string): ClientInfo {
    return {
      id: this.createToken(),
      alias: username,
      version: APP_BUILD_LABEL,
      deviceType: PeerDeviceType.desktop,
      token: this.createToken(),
    };
  }

  private createToken(): string {
    if (typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  }
}

class UdpDirectPeerConnection implements PeerConnection {
  private onStatus: ((status: P2pStatus) => void) | undefined;
  private onMessage: (message: ServerMessage) => void = () => undefined;
  private peerLoadingDone = false;
  private started = false;

  constructor(
    private readonly session: UdpDirectSession,
    private readonly localPlayerId: PlayerId,
  ) { }

  get connected(): boolean {
    return true;
  }

  get remoteLoadingDone(): boolean {
    return this.peerLoadingDone;
  }

  get status(): P2pStatus {
    return "connected";
  }

  start(): void {
    if (this.started) {
      return;
    }
    this.started = true;
    this.onStatus?.("connected");
  }

  close(): void {
    this.peerLoadingDone = false;
    this.onStatus = undefined;
    this.onMessage = () => undefined;
  }

  setStatusHandler(handler: ((status: P2pStatus) => void) | undefined): void {
    this.onStatus = handler;
    handler?.("connected");
  }

  setMessageHandler(handler: (message: ServerMessage) => void): void {
    this.onMessage = handler;
  }

  handleServerMessage(message: ServerMessage): boolean {
    if (message.type === "peer_loading_done") {
      if (message.playerId === this.localPlayerId) {
        return true;
      }
      this.peerLoadingDone = true;
      this.onMessage(message);
      return true;
    }

    if (message.type === "input_frame" || message.type === "peer_game_over") {
      if ("playerId" in message && message.playerId === this.localPlayerId) {
        return true;
      }
      this.onMessage(message);
      return true;
    }

    return false;
  }

  send(message: ClientMessage): boolean {
    return this.session.sendPeerPacket(this.localPlayerId, message);
  }
}
