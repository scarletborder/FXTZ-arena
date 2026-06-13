import { decodeProtocolMessage, encodeProtocolMessage } from "@repo/types";
import type { ClientMessage, PlayerId, ServerMessage } from "@repo/types";

import type { ConnectionManager } from "./client";
import {
  createNetworkServiceContext,
  dataChannelMessageToPeerServerMessage,
  proxyP2pServerMessage,
  type NetworkServiceContext,
} from "./handler";

export type P2pStatus = "disabled" | "idle" | "connecting" | "connected" | "failed";

export interface PeerConnection {
  readonly connected: boolean;
  readonly remoteLoadingDone: boolean;
  readonly status: P2pStatus;
  start(): void;
  close(): void;
  setStatusHandler(handler: ((status: P2pStatus) => void) | undefined): void;
  setMessageHandler(handler: (message: ServerMessage) => void): void;
  handleServerMessage(message: ServerMessage): boolean;
  send(message: ClientMessage): boolean;
}

export interface P2pConnectionOptions {
  readonly localPlayerId: PlayerId;
  readonly enabled: boolean;
  readonly stunServer: string;
  readonly timeoutMs?: number;
  readonly onStatus?: (status: P2pStatus) => void;
  readonly onMessage: (message: ServerMessage) => void;
}

const DEFAULT_TIMEOUT_MS = 20_000;

export class P2pConnection implements PeerConnection {
  private peer: RTCPeerConnection | null = null;
  private channel: RTCDataChannel | null = null;
  private timeout: ReturnType<typeof setTimeout> | null = null;
  private remoteIntent: boolean | null = null;
  private started = false;
  private readySent = false;
  private peerLoadingDone = false;
  private currentStatus: P2pStatus = "idle";
  private terminalFailed = false;
  private pendingCandidates: RTCIceCandidateInit[] = [];
  private onStatus: ((status: P2pStatus) => void) | undefined;
  private onMessage: (message: ServerMessage) => void;
  private readonly serviceContext: NetworkServiceContext;

  constructor(
    private readonly connectionManager: ConnectionManager,
    private readonly options: P2pConnectionOptions,
  ) {
    this.onStatus = options.onStatus;
    this.onMessage = options.onMessage;
    this.serviceContext = createNetworkServiceContext(options.localPlayerId, {
      transport: "webrtc",
      stunServer: options.stunServer,
    });
    if (!options.enabled) {
      this.setStatus("disabled");
    }
  }

  get connected(): boolean {
    return this.currentStatus === "connected" && this.channel?.readyState === "open";
  }

  get remoteLoadingDone(): boolean {
    return this.peerLoadingDone;
  }

  get status(): P2pStatus {
    return this.currentStatus;
  }

  start(): void {
    if (this.started || this.terminalFailed) {
      return;
    }
    this.started = true;

    if (!this.options.enabled) {
      this.connectionManager.send({ type: "p2p_intent", enabled: false });
      this.setStatus("disabled");
      return;
    }

    if (!canUseWebRtc()) {
      this.connectionManager.send({ type: "p2p_intent", enabled: false });
      this.fail("webrtc_unavailable");
      return;
    }

    this.connectionManager.send({ type: "p2p_intent", enabled: true });
    this.setStatus("connecting");
    this.startTimer();
    this.tryBeginHandshake();
  }

  setStatusHandler(handler: ((status: P2pStatus) => void) | undefined): void {
    this.onStatus = handler;
  }

  setMessageHandler(handler: (message: ServerMessage) => void): void {
    this.onMessage = handler;
  }

  handleServerMessage(message: ServerMessage): boolean {
    return proxyP2pServerMessage(this.serviceContext, message, {
      terminalFailed: this.terminalFailed,
      onRemoteIntent: (enabled) => {
        this.remoteIntent = enabled;
        if (!enabled) {
          this.fail("peer_disabled");
          return;
        }
        this.tryBeginHandshake();
      },
      onSignal: (signal) => {
        void this.handleSignal(signal);
      },
      onPeerLoadingDone: () => {
        this.peerLoadingDone = true;
      },
      onMessage: (nextMessage) => this.onMessage(nextMessage),
    });
  }

  send(message: ClientMessage): boolean {
    if (!this.connected || !this.channel) {
      return false;
    }

    try {
      const bytes = encodeProtocolMessage(message);
      const packet = bytes.slice();
      this.channel.send(packet);
      return true;
    } catch {
      this.fail("send_error");
      return false;
    }
  }

  close(): void {
    this.clearTimer();
    this.channel?.close();
    this.peer?.close();
    this.channel = null;
    this.peer = null;
    this.pendingCandidates = [];
    this.peerLoadingDone = false;
    this.setStatus(this.options.enabled ? "idle" : "disabled");
  }

  private tryBeginHandshake(): void {
    if (this.terminalFailed || !this.options.enabled || this.remoteIntent === false || this.peer) {
      return;
    }

    if (this.remoteIntent !== true && this.options.localPlayerId !== "Player1") {
      return;
    }

    this.createPeer();

    if (this.options.localPlayerId === "Player1") {
      const channel = this.peer!.createDataChannel("fxtz-input", {
        ordered: false,
        maxRetransmits: 0,
      });
      this.attachChannel(channel);
      void this.createOffer();
    }
  }

  private createPeer(): void {
    this.peer = new RTCPeerConnection({
      iceServers: [{ urls: this.options.stunServer }],
    });
    this.peer.onicecandidate = (event) => {
      if (!event.candidate) return;
      this.connectionManager.send({
        type: "p2p_signal",
        signal: {
          kind: "candidate",
          candidate: event.candidate.candidate,
          sdpMid: event.candidate.sdpMid,
          sdpMLineIndex: event.candidate.sdpMLineIndex,
        },
      });
    };
    this.peer.ondatachannel = (event) => {
      this.attachChannel(event.channel);
    };
    this.peer.onconnectionstatechange = () => {
      const state = this.peer?.connectionState;
      if (state === "failed" || state === "disconnected" || state === "closed") {
        this.fail(`connection_state:${state}`);
      }
    };
  }

  private attachChannel(channel: RTCDataChannel): void {
    this.channel = channel;
    channel.binaryType = "arraybuffer";
    channel.onopen = () => {
      this.clearTimer();
      this.setStatus("connected");
      if (!this.readySent) {
        this.readySent = true;
        this.connectionManager.send({ type: "p2p_ready" });
      }
    };
    channel.onclose = () => {
      if (this.currentStatus === "connected") {
        this.fail("channel_closed");
      }
    };
    channel.onerror = () => this.fail("channel_error");
    channel.onmessage = (event) => {
      const decoded = decodeProtocolMessage(event.data);
      if (decoded && typeof decoded === "object" && "type" in decoded) {
        const message = decoded as ClientMessage | ServerMessage;
        const serverMessage = dataChannelMessageToPeerServerMessage(this.serviceContext, message);
        if (serverMessage.type === "peer_loading_done" && serverMessage.playerId !== this.options.localPlayerId) {
          this.peerLoadingDone = true;
        }
        this.onMessage(serverMessage);
      }
    };
  }

  private async createOffer(): Promise<void> {
    if (!this.peer) return;
    const offer = await this.peer.createOffer();
    await this.peer.setLocalDescription(offer);
    if (offer.sdp) {
      this.connectionManager.send({ type: "p2p_signal", signal: { kind: "offer", sdp: offer.sdp } });
    }
  }

  private async handleSignal(signal: Extract<ServerMessage, { type: "peer_p2p_signal" }>["signal"]): Promise<void> {
    if (this.terminalFailed || !this.options.enabled || this.remoteIntent === false) {
      return;
    }

    if (!this.peer) {
      this.createPeer();
      this.setStatus("connecting");
      this.startTimer();
    }

    if (!this.peer) return;

    try {
      if (signal.kind === "offer") {
        await this.peer.setRemoteDescription({ type: "offer", sdp: signal.sdp });
        await this.flushPendingCandidates();
        const answer = await this.peer.createAnswer();
        await this.peer.setLocalDescription(answer);
        if (answer.sdp) {
          this.connectionManager.send({ type: "p2p_signal", signal: { kind: "answer", sdp: answer.sdp } });
        }
      } else if (signal.kind === "answer") {
        await this.peer.setRemoteDescription({ type: "answer", sdp: signal.sdp });
        await this.flushPendingCandidates();
      } else {
        const candidate = {
          candidate: signal.candidate,
          sdpMid: signal.sdpMid,
          sdpMLineIndex: signal.sdpMLineIndex,
        };
        if (!this.peer.remoteDescription) {
          this.pendingCandidates.push(candidate);
        } else {
          await this.peer.addIceCandidate(candidate);
        }
      }
    } catch {
      this.fail("signal_error");
    }
  }

  private async flushPendingCandidates(): Promise<void> {
    if (!this.peer?.remoteDescription) {
      return;
    }

    const candidates = this.pendingCandidates;
    this.pendingCandidates = [];
    for (const candidate of candidates) {
      await this.peer.addIceCandidate(candidate);
    }
  }

  private startTimer(): void {
    this.clearTimer();
    this.timeout = setTimeout(() => this.fail("timeout"), this.options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  }

  private clearTimer(): void {
    if (this.timeout !== null) {
      clearTimeout(this.timeout);
      this.timeout = null;
    }
  }

  private fail(reason: string): void {
    if (this.terminalFailed) {
      return;
    }
    this.terminalFailed = true;
    console.error("[P2P] failed", {
      reason,
      status: this.currentStatus,
      remoteIntent: this.remoteIntent,
      started: this.started,
      peerConnectionState: this.peer?.connectionState ?? null,
      dataChannelState: this.channel?.readyState ?? null,
    });
    this.clearTimer();
    this.channel?.close();
    this.peer?.close();
    this.channel = null;
    this.peer = null;
    this.pendingCandidates = [];
    this.peerLoadingDone = false;
    this.setStatus(this.options.enabled ? "failed" : "disabled");
  }

  private setStatus(status: P2pStatus): void {
    if (this.currentStatus === status) {
      return;
    }
    this.currentStatus = status;
    if (status === "connected" || status === "failed") {
      console.log(`[P2P] ${status}`);
    }
    this.onStatus?.(status);
  }
}

function canUseWebRtc(): boolean {
  return typeof RTCPeerConnection !== "undefined";
}

