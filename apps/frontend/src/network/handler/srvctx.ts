import type { ClientMessage, InputFrameMessage, PlayerId, ServerMessage } from "@repo/types";

export interface NetworkServiceContext<Extra extends Record<string, unknown> = Record<string, unknown>> {
  readonly localPlayerId: PlayerId;
  readonly extra: Extra;
}

export function createNetworkServiceContext<Extra extends Record<string, unknown> = Record<string, unknown>>(
  localPlayerId: PlayerId,
  extra = {} as Extra,
): NetworkServiceContext<Extra> {
  return {
    localPlayerId,
    extra,
  };
}

export function remotePlayerIdOf(localPlayerId: PlayerId): PlayerId {
  return localPlayerId === "Player1" ? "Player2" : "Player1";
}

export function clientMessageToPeerServerMessage(
  ctx: NetworkServiceContext,
  message: ClientMessage,
  playerId: PlayerId = ctx.localPlayerId,
): ServerMessage | null {
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
    case "collaborate_shop_forced_ready":
      return {
        type: "peer_collaborate_shop_forced_ready",
        playerId,
        frame: message.frame,
        shopIndex: message.shopIndex,
      };
    case "collaborate_shop_action":
      return {
        type: "peer_collaborate_shop_action",
        playerId,
        shopIndex: message.shopIndex,
        ready: message.ready,
        purchaseItemId: message.purchaseItemId,
        activeCardSwitchId: message.activeCardSwitchId,
      };
    default:
      return null;
  }
}

export function dataChannelMessageToPeerServerMessage(
  ctx: NetworkServiceContext,
  message: ClientMessage | ServerMessage,
): ServerMessage {
  const remotePlayerId = remotePlayerIdOf(ctx.localPlayerId);
  if (message.type === "input_frame" && !("playerId" in message)) {
    return {
      ...message,
      playerId: remotePlayerId,
    };
  }

  if (message.type === "loading_done") {
    return {
      type: "peer_loading_done",
      playerId: remotePlayerId,
    };
  }

  const peerMessage = clientMessageToPeerServerMessage(ctx, message as ClientMessage, remotePlayerId);
  if (peerMessage) {
    return peerMessage;
  }

  return message as ServerMessage;
}

export interface P2pServerProxyHandlers {
  readonly terminalFailed: boolean;
  onRemoteIntent(enabled: boolean): void;
  onSignal(signal: Extract<ServerMessage, { type: "peer_p2p_signal" }>["signal"]): void;
  onPeerLoadingDone(): void;
  onMessage(message: ServerMessage): void;
}

export function proxyP2pServerMessage(
  ctx: NetworkServiceContext,
  message: ServerMessage,
  handlers: P2pServerProxyHandlers,
): boolean {
  if (handlers.terminalFailed) {
    return isP2pProxyMessage(message);
  }

  switch (message.type) {
    case "peer_p2p_intent":
      if (message.playerId === ctx.localPlayerId) return true;
      handlers.onRemoteIntent(message.enabled);
      return true;
    case "peer_p2p_signal":
      if (message.playerId === ctx.localPlayerId) return true;
      handlers.onSignal(message.signal);
      return true;
    case "peer_p2p_ready":
      return message.playerId !== ctx.localPlayerId;
    case "peer_loading_done":
      if (message.playerId === ctx.localPlayerId) return true;
      handlers.onPeerLoadingDone();
      handlers.onMessage(message);
      return true;
    case "peer_game_over":
    case "peer_collaborate_shop_forced_ready":
    case "peer_collaborate_shop_action":
      if (message.playerId === ctx.localPlayerId) return true;
      handlers.onMessage(message);
      return true;
    default:
      return false;
  }
}

export interface DirectPeerServerProxyHandlers {
  onPeerLoadingDone(): void;
  onMessage(message: ServerMessage): void;
}

export function proxyDirectPeerServerMessage(
  ctx: NetworkServiceContext,
  message: ServerMessage,
  handlers: DirectPeerServerProxyHandlers,
): boolean {
  switch (message.type) {
    case "peer_loading_done":
      if (message.playerId === ctx.localPlayerId) return true;
      handlers.onPeerLoadingDone();
      handlers.onMessage(message);
      return true;
    case "input_frame":
    case "peer_game_over":
    case "peer_collaborate_shop_forced_ready":
    case "peer_collaborate_shop_action":
      if ("playerId" in message && message.playerId === ctx.localPlayerId) return true;
      handlers.onMessage(message);
      return true;
    default:
      return false;
  }
}

function isP2pProxyMessage(message: ServerMessage): boolean {
  switch (message.type) {
    case "peer_p2p_intent":
    case "peer_p2p_signal":
    case "peer_p2p_ready":
    case "peer_loading_done":
    case "peer_game_over":
    case "peer_collaborate_shop_forced_ready":
    case "peer_collaborate_shop_action":
      return true;
    default:
      return false;
  }
}
