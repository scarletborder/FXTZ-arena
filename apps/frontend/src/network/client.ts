import type { BattleConfig, BattleRoomMode, ClientMessage, PlayerId, ServerMessage } from "@repo/types";
import { APP_BUILD_LABEL, IS_DESKTOP_APP } from "@repo/constants";
import { isWebTransportAddress, normalizeServerAddress } from "./address";
import { findServerCertificateFingerprint } from "./fingerprint";
import { WsNetworkTransport, WtDesktopTransport, WtNetworkTransport } from "./transport";
import type { BaseNetworkTransport } from "./transport";

export type ConnectionStatus = "disconnected" | "connecting" | "connected" | "error";

/**
 * Singleton server connection manager.
 *
 * - Connects to the dedicated server over WebSocket or WebTransport.
 * - Dispatches incoming {@link ServerMessage}s to a single handler
 *   (set by whichever Phaser scene is currently active).
 * - Tracks connection and room state for synchronous reads by scenes.
 * - Sends periodic pings to keep the connection alive.
 */
export class ConnectionManager {
  private transport: BaseNetworkTransport | null = null;
  private pingInterval: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private lastAddress: string | null = null;
  private lastUsername = "Player";
  private manualDisconnect = false;
  private fingerprintRetryAttempted = false;

  /** Latest known server protocol version. */
  serverVersion: string | null = null;
  /** ID of the room this client is currently in, if any. */
  roomId: string | null = null;
  /** This client's assigned player slot in the room. */
  playerId: PlayerId | null = null;
  /** The opponent's display name, if known. */
  opponentUsername: string | null = null;
  /** Latest room status received from the server. */
  roomStatus: string | null = null;
  /** Current room battle mode. */
  battleMode: BattleRoomMode | null = null;
  /** Battle configuration received from server when both players ready. */
  battleConfig: BattleConfig | null = null;

  /** Lobby: room display name. */
  roomName: string | null = null;
  /** Lobby: host player's display name. */
  hostName: string | null = null;
  /** Lobby: configured life count. */
  lifeCount: number | null = null;
  /** Lobby: configured cost limit. */
  costLimit: number | null = null;
  /** Lobby: whether the opponent has readied up. */
  opponentReady: boolean | null = null;
  /** Whether this connection is watching a room instead of playing. */
  isSpectator = false;
  /** Spectator display names reported by the server. */
  spectatorNames: readonly string[] = [];
  /** Player display names reported by the server, in Player1/Player2 order. */
  playerNames: readonly string[] = [];
  /** Whether the current room allows spectators. */
  allowSpectators: boolean | null = null;
  /** Current spectator count for the room. */
  spectatorCount = 0;

  private readonly statusListeners = new Set<(status: ConnectionStatus) => void>();
  private _handler: ((msg: ServerMessage) => void) | null = null;
  private _status: ConnectionStatus = "disconnected";

  get status(): ConnectionStatus {
    return this._status;
  }

  private setStatus(s: ConnectionStatus): void {
    if (this._status !== s) {
      this._status = s;
      this.notifyStatusListeners();
    }
  }

  addStatusListener(listener: (status: ConnectionStatus) => void): () => void {
    this.statusListeners.add(listener);
    return () => {
      this.statusListeners.delete(listener);
    };
  }

  private notifyStatusListeners(): void {
    for (const listener of this.statusListeners) {
      listener(this._status);
    }
  }

  /** Register the single message handler (typically called by the active scene). */
  setMessageHandler(handler: ((msg: ServerMessage) => void) | null): void {
    this._handler = handler;
  }

  /**
   * Open a WebSocket connection to the server.
   * If already connected or connecting, this is a no-op.
   */
  connect(address: string, username: string = "Player"): void {
    if (this.transport && (this.transport.readyState === "open" || this.transport.readyState === "connecting")) {
      return;
    }

    const normalizedAddress = normalizeServerAddress(address);
    const useWebTransport = isWebTransportAddress(normalizedAddress);
    const fingerprint = findServerCertificateFingerprint(normalizedAddress);
    this.fingerprintRetryAttempted = false;
    console.log("[FXTZ] ConnectionManager.connect", {
      inputAddress: address,
      normalizedAddress,
      useWebTransport,
      hasFingerprint: Boolean(fingerprint),
      isDesktop: IS_DESKTOP_APP,
    });

    this.lastAddress = normalizedAddress;
    this.lastUsername = username;
    this.manualDisconnect = false;
    this.setStatus("connecting");

    const onOpen = () => {
      console.log("[FXTZ] Connection opened", { address: normalizedAddress, useWebTransport });
      this.setStatus("connected");
      this.startPing();

      const reconnect = this.roomId && this.playerId
        ? {
          roomId: this.roomId,
          playerId: this.playerId,
          battleId: this.battleConfig?.battleId,
        }
        : undefined;

      this.send({
        type: "hello",
        username,
        clientVersion: APP_BUILD_LABEL,
        debug: false,
        reconnect,
      });
    };

    const onClose = () => {
      console.log("[FXTZ] Connection closed", {
        address: normalizedAddress,
        useWebTransport,
        manualDisconnect: this.manualDisconnect,
      });
      this.stopPing();
      this.transport = null;
      this.setStatus("disconnected");
      if (this.manualDisconnect || !this.roomId || !this.playerId) {
        this.resetRoomState();
        return;
      }
      this.scheduleReconnect();
    };

    const onError = (error: Error) => {
      console.warn("[FXTZ] Connection error", {
        address: normalizedAddress,
        useWebTransport,
        error: error.message,
      });
      this.setStatus("error");
      if (!this.fingerprintRetryAttempted && useWebTransport && !fingerprint && !IS_DESKTOP_APP) {
        this.fingerprintRetryAttempted = true;
        void this.retryWebTransportWithFingerprint(normalizedAddress, onOpen, onClose, onError, onMessage);
      }
    };

    const onMessage = (msg: ServerMessage) => {
      this.handleServerMessage(msg);
      this._handler?.(msg);
    };

    this.transport = useWebTransport
      ? IS_DESKTOP_APP
        ? new WtDesktopTransport(normalizedAddress, { open: onOpen, close: onClose, error: onError, message: onMessage })
        : new WtNetworkTransport(
          normalizedAddress,
          { open: onOpen, close: onClose, error: onError, message: onMessage },
          fingerprint,
        )
      : new WsNetworkTransport(normalizedAddress, { open: onOpen, close: onClose, error: onError, message: onMessage });
    this.transport.open();
  }

  private async retryWebTransportWithFingerprint(
    normalizedAddress: string,
    onOpen: () => void,
    onClose: () => void,
    onError: (error: Error) => void,
    onMessage: (msg: ServerMessage) => void,
  ): Promise<void> {
    try {
      const fingerprintUrl = buildFingerprintUrl(normalizedAddress);
      console.log("[FXTZ] Fetching fingerprint", { fingerprintUrl });
      const response = await fetch(fingerprintUrl, { cache: "no-store" });
      if (!response.ok) {
        console.warn("[FXTZ] Fingerprint request failed", { status: response.status });
        return;
      }
      const fingerprint = (await response.text()).trim();
      if (!fingerprint) {
        console.warn("[FXTZ] Fingerprint response empty");
        return;
      }
      console.log("[FXTZ] Retrying WebTransport with fingerprint", { normalizedAddress });
      this.transport?.close();
      this.transport = IS_DESKTOP_APP
        ? new WtDesktopTransport(normalizedAddress, { open: onOpen, close: onClose, error: onError, message: onMessage })
        : new WtNetworkTransport(
          normalizedAddress,
          { open: onOpen, close: onClose, error: onError, message: onMessage },
          fingerprint,
        );
      this.transport.open();
    } catch (error) {
      console.warn("[FXTZ] Fingerprint retry failed", { error: this.asErrorMessage(error) });
    }
  }

  /** Close the server connection. */
  disconnect(): void {
    this.manualDisconnect = true;
    this.clearReconnectTimer();
    this.stopPing();
    this.transport?.close();
    this.transport = null;
    this.setStatus("disconnected");
    this.resetRoomState();
    this._handler = null;
  }

  /** Send a typed message to the server. */
  send(msg: ClientMessage): void {
    if (this.transport?.readyState === "open") {
      this.transport.send(msg);
    }
    if (msg.type === "leave_room") {
      this.resetRoomState();
    }
  }

  /** Update internal state from server messages (fires before the scene handler). */
  private handleServerMessage(msg: ServerMessage): void {
    switch (msg.type) {
      case "server_hello":
        this.serverVersion = msg.serverVersion;
        this.notifyStatusListeners();
        break;
      case "room_joined":
        this.roomId = msg.roomId;
        this.playerId = msg.playerId ?? null;
        this.isSpectator = msg.spectator === true;
        // Clear stale state from previous room (opponentUsername, etc.)
        this.opponentUsername = null;
        this.opponentReady = null;
        this.battleConfig = null;
        this.roomStatus = null;
        this.roomName = null;
        this.hostName = null;
        this.lifeCount = null;
        this.costLimit = null;
        this.battleMode = null;
        this.spectatorNames = [];
        this.playerNames = [];
        this.allowSpectators = null;
        this.spectatorCount = 0;
        break;
      case "room_state": {
        const previousStatus = this.roomStatus;
        const hadOpponent =
          this.opponentUsername !== null ||
          this.opponentReady !== null ||
          previousStatus === "selecting" ||
          previousStatus === "loading" ||
          previousStatus === "fighting";
        if (msg.playerCount < 2 && hadOpponent && msg.roomId === this.roomId && msg.status !== "waiting") {
          this.resetRoomState();
          break;
        }
        this.roomStatus = msg.status;
        if (msg.playerCount < 2) {
          this.opponentUsername = null;
          this.opponentReady = null;
        } else if (msg.opponentUsername) {
          this.opponentUsername = msg.opponentUsername;
        }
        if (msg.roomName !== undefined) this.roomName = msg.roomName;
        if (msg.hostName !== undefined) this.hostName = msg.hostName;
        if (msg.lifeCount !== undefined) this.lifeCount = msg.lifeCount;
        if (msg.costLimit !== undefined) this.costLimit = msg.costLimit;
        if (msg.battleMode !== undefined) this.battleMode = msg.battleMode;
        if (msg.opponentReady !== undefined) this.opponentReady = msg.opponentReady;
        if (msg.allowSpectators !== undefined) this.allowSpectators = msg.allowSpectators;
        if (msg.spectatorCount !== undefined) this.spectatorCount = msg.spectatorCount;
        if (msg.spectatorNames !== undefined) this.spectatorNames = msg.spectatorNames;
        if (msg.playerNames !== undefined) this.playerNames = msg.playerNames;
        break;
      }
      case "battle_start":
        this.battleConfig = msg.config;
        this.battleMode = msg.config.battleMode;
        break;
      case "game_starting":
        if (msg.battleMode !== undefined) this.battleMode = msg.battleMode;
        break;
      case "error":
        if (msg.code === "reconnect_failed") {
          this.clearReconnectTimer();
          this.resetRoomState();
        }
        // Errors are forwarded to the scene handler
        break;
    }
  }

  /** Clear room-related state (used on disconnect / leave). */
  private resetRoomState(): void {
    this.roomId = null;
    this.playerId = null;
    this.opponentUsername = null;
    this.roomStatus = null;
    this.battleConfig = null;
    this.roomName = null;
    this.hostName = null;
    this.lifeCount = null;
    this.costLimit = null;
    this.battleMode = null;
    this.opponentReady = null;
    this.isSpectator = false;
    this.spectatorNames = [];
    this.playerNames = [];
    this.allowSpectators = null;
    this.spectatorCount = 0;
  }

  private startPing(): void {
    this.stopPing();
    this.pingInterval = setInterval(() => {
      this.send({ type: "ping", seq: Date.now() });
    }, 10_000);
  }

  private stopPing(): void {
    if (this.pingInterval !== null) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  private scheduleReconnect(): void {
    this.clearReconnectTimer();
    if (!this.lastAddress) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (!this.lastAddress || this.manualDisconnect) return;
      this.connect(this.lastAddress, this.lastUsername);
    }, 120);
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private asErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}

function buildFingerprintUrl(normalizedAddress: string): string {
  const url = new URL(normalizedAddress);
  url.pathname = "/fingerprint";
  url.search = "";
  url.hash = "";
  return url.toString();
}
