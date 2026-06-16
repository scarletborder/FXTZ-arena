import { SignalingConnection as PublicSignalingConnection, type ClientInfo, type ClientInfoWithoutId, PeerDeviceType, type WsServerMessage } from "./local-lan/services/signaling";
import { decodeBase64, encodeStringToBase64 } from "./local-lan/utils/base64";
import { APP_BUILD_LABEL } from "@repo/constants";
import type { ClientMessage, PlayerId, PlayerLoadout, ServerMessage } from "@repo/types";
import { clientMessageToPeerServerMessage, createNetworkServiceContext } from "./handler";

const PUBLIC_SIGNALING_URL = "wss://public.localsend.org/v1/ws";

export interface LocalPeerState {
  readonly peer: ClientInfo;
  readonly outgoingRequest: boolean;
  readonly incomingRequest: boolean;
  readonly matched: boolean;
}

export interface LocalLanSessionCallbacks {
  readonly onPeersChange?: (peers: readonly LocalPeerState[]) => void;
  readonly onMatch?: (peer: ClientInfo) => void;
  readonly onStatusChange?: (status: "connecting" | "connected" | "disconnected" | "error") => void;
  readonly onBattleReady?: (peer: ClientInfo, loadout: PlayerLoadout) => void;
}

type LocalPayload =
  | {
    kind: "match_request";
    sourceId: string;
    sourceName: string;
    targetId: string;
  }
  | {
    kind: "p2p_packet";
    sourceId: string;
    targetId: string;
    message: ServerMessage;
  }
  | {
    kind: "battle_ready";
    sourceId: string;
    targetId: string;
    loadout: PlayerLoadout;
  };

export class LocalLanSession {
  private signaling: PublicSignalingConnection | null = null;
  private client: ClientInfo | null = null;
  private peers = new Map<string, ClientInfo>();
  private outgoingRequests = new Set<string>();
  private incomingRequests = new Set<string>();
  private matchedPeerId: string | null = null;
  private peerPacketHandler: ((message: ServerMessage) => void) | null = null;

  constructor(private readonly callbacks: LocalLanSessionCallbacks = {}) { }

  get currentClient(): ClientInfo | null {
    return this.client;
  }

  get status(): "connecting" | "connected" | "disconnected" | "error" {
    return this.signaling ? "connected" : "disconnected";
  }

  getPeerStates(): LocalPeerState[] {
    const localId = this.client?.id ?? null;
    return [...this.peers.values()]
      .filter((peer) => peer.id !== localId)
      .sort((left, right) => left.alias.localeCompare(right.alias, "zh-Hans-CN"))
      .map((peer) => ({
        peer,
        outgoingRequest: this.outgoingRequests.has(peer.id),
        incomingRequest: this.incomingRequests.has(peer.id),
        matched: this.matchedPeerId === peer.id,
      }));
  }

  async connect(username: string): Promise<void> {
    this.callbacks.onStatusChange?.("connecting");
    const info = this.createClientInfo(username);
    this.client = null;
    this.peers.clear();
    this.outgoingRequests.clear();
    this.incomingRequests.clear();
    this.matchedPeerId = null;

    this.signaling = await PublicSignalingConnection.connect({
      url: PUBLIC_SIGNALING_URL,
      info,
      onMessage: (message) => this.handleServerMessage(message),
      generateNewInfo: async () => this.createClientInfo(username),
      onClose: () => {
        this.signaling = null;
        this.client = null;
        this.peers.clear();
        this.outgoingRequests.clear();
        this.incomingRequests.clear();
        this.matchedPeerId = null;
        this.peerPacketHandler = null;
        this.callbacks.onStatusChange?.("disconnected");
        this.callbacks.onPeersChange?.(this.getPeerStates());
      },
    });
    this.callbacks.onStatusChange?.("connected");
  }

  close(): void {
    this.signaling?.close();
    this.signaling = null;
    this.client = null;
    this.peers.clear();
    this.outgoingRequests.clear();
    this.incomingRequests.clear();
    this.matchedPeerId = null;
    this.peerPacketHandler = null;
    this.callbacks.onPeersChange?.(this.getPeerStates());
    this.callbacks.onStatusChange?.("disconnected");
  }

  requestPeer(peerId: string): void {
    if (!this.signaling || !this.client || !this.peers.has(peerId)) {
      return;
    }

    this.outgoingRequests.add(peerId);
    this.emitPeerStates();
    this.sendPayload(peerId, {
      kind: "match_request",
      sourceId: this.client.id,
      sourceName: this.client.alias,
      targetId: peerId,
    });
    this.maybeMatch(peerId);
  }

  setPeerPacketHandler(handler: ((message: ServerMessage) => void) | null): void {
    this.peerPacketHandler = handler;
  }

  createP2pBridge(targetPeerId: string, localPlayerId: PlayerId): { send(message: ClientMessage): void } {
    const serviceContext = createNetworkServiceContext(localPlayerId, {
      transport: "local-lan",
      targetPeerId,
    });
    return {
      send: (message) => this.sendPeerPacket(targetPeerId, serviceContext, message),
    };
  }

  sendBattleReady(targetPeerId: string, loadout: PlayerLoadout): void {
    if (!this.signaling || !this.client) {
      return;
    }

    this.sendPayload(targetPeerId, {
      kind: "battle_ready",
      sourceId: this.client.id,
      targetId: targetPeerId,
      loadout,
    });
  }

  private handleServerMessage(message: WsServerMessage): void {
    switch (message.type) {
      case "HELLO":
        this.client = message.client;
        this.peers = new Map(message.peers.map((peer) => [peer.id, peer]));
        this.emitPeerStates();
        return;
      case "JOIN":
        this.peers.set(message.peer.id, message.peer);
        this.emitPeerStates();
        return;
      case "UPDATE":
        this.peers.set(message.peer.id, message.peer);
        this.emitPeerStates();
        return;
      case "LEFT":
        this.peers.delete(message.peerId);
        this.outgoingRequests.delete(message.peerId);
        this.incomingRequests.delete(message.peerId);
        if (this.matchedPeerId === message.peerId) {
          this.matchedPeerId = null;
        }
        this.emitPeerStates();
        return;
      case "OFFER":
      case "ANSWER": {
        const payload = this.decodePayload(message.sdp);
        if (!payload) {
          return;
        }
        if (payload.kind === "match_request") {
          this.incomingRequests.add(message.peer.id);
          this.emitPeerStates();
          this.maybeMatch(message.peer.id);
          return;
        }
        if (payload.kind === "p2p_packet") {
          if (payload.targetId === this.client?.id && payload.sourceId === message.peer.id) {
            this.peerPacketHandler?.(payload.message);
          }
          return;
        }
        if (payload.kind === "battle_ready") {
          if (payload.targetId === this.client?.id && payload.sourceId === message.peer.id) {
            this.callbacks.onBattleReady?.(message.peer, payload.loadout);
          }
        }
        return;
      }
      case "ERROR":
        this.callbacks.onStatusChange?.("error");
        return;
    }
  }

  private maybeMatch(peerId: string): void {
    if (this.matchedPeerId === peerId) {
      return;
    }
    if (!this.outgoingRequests.has(peerId) || !this.incomingRequests.has(peerId)) {
      return;
    }

    const peer = this.peers.get(peerId);
    if (!peer) {
      return;
    }

    this.matchedPeerId = peerId;
    this.emitPeerStates();
    this.callbacks.onMatch?.(peer);
  }

  private sendPeerPacket(
    targetPeerId: string,
    serviceContext: ReturnType<typeof createNetworkServiceContext>,
    message: ClientMessage,
  ): void {
    if (!this.signaling || !this.client) {
      return;
    }

    const packet = clientMessageToPeerServerMessage(serviceContext, message);
    if (!packet) {
      return;
    }

    this.sendPayload(targetPeerId, {
      kind: "p2p_packet",
      sourceId: this.client.id,
      targetId: targetPeerId,
      message: packet,
    });
  }

  private sendPayload(targetPeerId: string, payload: LocalPayload): void {
    if (!this.signaling || !this.client) {
      return;
    }

    this.signaling.send({
      type: "OFFER",
      sessionId: this.createSessionId(),
      target: targetPeerId,
      sdp: encodeStringToBase64(JSON.stringify(payload)),
    });
  }

  private decodePayload(sdp: string): LocalPayload | null {
    try {
      const raw = new TextDecoder().decode(decodeBase64(sdp));
      const payload = JSON.parse(raw) as LocalPayload;
      if (!payload || typeof payload !== "object" || !("kind" in payload)) {
        return null;
      }
      return payload;
    } catch {
      return null;
    }
  }

  private createClientInfo(username: string): ClientInfoWithoutId {
    return {
      alias: username,
      version: APP_BUILD_LABEL,
      deviceType: PeerDeviceType.web,
      token: this.createToken(),
    };
  }

  private createToken(): string {
    if (typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  }

  private createSessionId(): string {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
  }

  private emitPeerStates(): void {
    this.callbacks.onPeersChange?.(this.getPeerStates());
  }
}
