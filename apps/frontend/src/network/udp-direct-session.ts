import { APP_BUILD_LABEL } from "@repo/constants";
import type { ClientMessage, PlayerId, PlayerLoadout, ServerMessage } from "@repo/types";

import type { ConnectionManager } from "./client";
import { listenUdp, sendUdp, stopUdp, subscribeUdp } from "./desktop-udp";
import {
  clientMessageToPeerServerMessage,
  createNetworkServiceContext,
  proxyDirectPeerServerMessage,
  type NetworkServiceContext,
} from "./handler";
import { type ClientInfo, PeerDeviceType } from "./local-lan/services/signaling";
import type { PeerConnection, P2pStatus } from "./p2p";

export interface UdpDirectSessionCallbacks {
  readonly onMatch?: (peer: ClientInfo) => void;
  readonly onBattleReady?: (peer: ClientInfo, loadout: PlayerLoadout) => void;
  readonly onPacket?: (addr: string) => void;
  readonly onSpectatorJoin?: (spectator: ClientInfo) => void;
  readonly onSpectatorWelcome?: (host: ClientInfo) => void;
  readonly onSpectatorMessage?: (message: ServerMessage) => void;
}

type UdpPayload =
  | {
    kind: "hello";
    client: ClientInfo;
    spectator?: boolean;
  }
  | {
    kind: "welcome";
    client: ClientInfo;
  }
  | {
    kind: "spectator_welcome";
    client: ClientInfo;
  }
  | {
    kind: "p2p_packet";
    message: ServerMessage;
  }
  | {
    kind: "spectator_packet";
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
  private readonly spectatorAddrs = new Map<string, ClientInfo>();
  private readonly spectatorHistory: ServerMessage[] = [];
  private peerPacketHandler: ((message: ServerMessage) => void) | null = null;
  private spectatorMessageHandler: ((message: ServerMessage) => void) | null = null;

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

  async connect(addr: string, username: string, spectator = false): Promise<void> {
    this.client = this.createClientInfo(username);
    this.peerAddr = addr;
    await listenUdp(0);
    this.unlisten?.();
    this.unlisten = await subscribeUdp((packet) => this.handlePacket(packet.addr, packet.data));
    await this.sendPayload({ kind: "hello", client: this.client, spectator });
  }

  close(): void {
    this.unlisten?.();
    this.unlisten = null;
    this.peerPacketHandler = null;
    this.spectatorMessageHandler = null;
    this.peer = null;
    this.peerAddr = null;
    this.spectatorAddrs.clear();
    this.spectatorHistory.length = 0;
    this.client = null;
    void stopUdp().catch(() => undefined);
  }

  setPeerPacketHandler(handler: ((message: ServerMessage) => void) | null): void {
    this.peerPacketHandler = handler;
  }

  setSpectatorMessageHandler(handler: ((message: ServerMessage) => void) | null): void {
    this.spectatorMessageHandler = handler;
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

    if (payload.kind === "hello" && this.role === "host" && payload.spectator === true) {
      this.spectatorAddrs.set(addr, payload.client);
      await this.sendPayloadTo(addr, { kind: "spectator_welcome", client: this.client });
      for (const message of this.spectatorHistory) {
        await this.sendPayloadTo(addr, { kind: "spectator_packet", message });
      }
      this.callbacks.onSpectatorJoin?.(payload.client);
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

    if (payload.kind === "spectator_welcome" && this.role === "guest") {
      this.peer = payload.client;
      this.peerAddr = addr;
      this.callbacks.onSpectatorWelcome?.(payload.client);
      return;
    }

    if (payload.kind === "spectator_packet" && this.role === "guest") {
      this.spectatorMessageHandler?.(payload.message);
      this.callbacks.onSpectatorMessage?.(payload.message);
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
    const serviceContext = createNetworkServiceContext(localPlayerId, {
      transport: "udp-direct",
      role: this.role,
      peerAddr: this.peerAddr,
    });
    const packet = clientMessageToPeerServerMessage(serviceContext, message);
    if (!packet) {
      return false;
    }
    void this.sendPayload({ kind: "p2p_packet", message: packet });
    return true;
  }

  spectatorCount(): number {
    return this.spectatorAddrs.size;
  }

  spectatorNames(): readonly string[] {
    return [...this.spectatorAddrs.values()].map((client) => client.alias);
  }

  sendToSpectators(message: ServerMessage): void {
    this.rememberSpectatorMessage(message);
    for (const addr of this.spectatorAddrs.keys()) {
      void this.sendPayloadTo(addr, { kind: "spectator_packet", message });
    }
  }

  private rememberSpectatorMessage(message: ServerMessage): void {
    if (message.type === "battle_start") {
      const firstInputIndex = this.spectatorHistory.findIndex((item) => item.type === "input_frame");
      const battleStartIndex = this.spectatorHistory.findIndex((item) => item.type === "battle_start");
      if (battleStartIndex === -1) {
        if (firstInputIndex === -1) this.spectatorHistory.push(message);
        else this.spectatorHistory.splice(firstInputIndex, 0, message);
        return;
      }
      this.spectatorHistory[battleStartIndex] = message;
      return;
    }

    if (message.type !== "input_frame") {
      return;
    }

    const existingIndex = this.spectatorHistory.findIndex(
      (item) => item.type === "input_frame" && item.playerId === message.playerId && item.frame === message.frame,
    );
    if (existingIndex === -1) {
      this.spectatorHistory.push(message);
      this.spectatorHistory.sort((a, b) => {
        if (a.type === "battle_start") return b.type === "battle_start" ? 0 : -1;
        if (b.type === "battle_start") return 1;
        if (a.type !== "input_frame" || b.type !== "input_frame") return 0;
        return a.frame - b.frame || a.playerId.localeCompare(b.playerId);
      });
      return;
    }
    this.spectatorHistory[existingIndex] = message;
  }

  private async sendPayload(payload: UdpPayload): Promise<void> {
    if (!this.peerAddr) {
      return;
    }
    await this.sendPayloadTo(this.peerAddr, payload);
  }

  private async sendPayloadTo(addr: string, payload: UdpPayload): Promise<void> {
    await sendUdp(addr, new TextEncoder().encode(JSON.stringify(payload)));
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
  private readonly serviceContext: NetworkServiceContext;

  constructor(
    private readonly session: UdpDirectSession,
    private readonly localPlayerId: PlayerId,
  ) {
    this.serviceContext = createNetworkServiceContext(localPlayerId, {
      transport: "udp-direct-peer",
    });
  }

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
    return proxyDirectPeerServerMessage(this.serviceContext, message, {
      onPeerLoadingDone: () => {
        this.peerLoadingDone = true;
      },
      onMessage: (nextMessage) => this.onMessage(nextMessage),
    });
  }

  send(message: ClientMessage): boolean {
    return this.session.sendPeerPacket(this.localPlayerId, message);
  }
}
