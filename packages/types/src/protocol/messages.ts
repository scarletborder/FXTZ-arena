import type {
  BattleConfig,
  BattleRoomMode,
  MapId,
  PlayerId,
  PlayerLoadout,
  RoomStatus,
  RoomSummary,
} from "../";

// ──────────────────────────────────────────
// Client → Server Messages
// ──────────────────────────────────────────

export interface HelloMessage {
  type: "hello";
  username: string;
  clientVersion: string;
  debug: boolean;
  reconnect?: {
    roomId: string;
    playerId: PlayerId;
    battleId?: string;
  };
}

export interface CreateRoomMessage {
  type: "create_room";
  name: string;
  username?: string;
  password?: string;
  battleMode?: BattleRoomMode;
  mapId: MapId;
  lifeCount: number;
  costLimit: number;
  p2pEnabled?: boolean;
  allowSpectators?: boolean;
}

export interface JoinRoomMessage {
  type: "join_room";
  roomId: string;
  username?: string;
  password?: string;
  p2pEnabled?: boolean;
  spectator?: boolean;
}

export interface QuickMatchMessage {
  type: "quick_match";
  username?: string;
  p2pEnabled?: boolean;
  battleMode?: BattleRoomMode;
}

export interface ListRoomsMessage {
  type: "list_rooms";
  page: number;
  pageSize: number;
  battleMode?: BattleRoomMode;
  spectatorsOnly?: boolean;
}

export interface LeaveRoomMessage {
  type: "leave_room";
}

export interface StartGameMessage {
  type: "start_game";
}

export interface LobbyReadyMessage {
  type: "lobby_ready";
  ready: boolean;
}

export interface ReadyMessage {
  type: "ready";
  loadout: PlayerLoadout;
}

export interface LoadingDoneMessage {
  type: "loading_done";
}

export interface P2pIntentMessage {
  type: "p2p_intent";
  enabled: boolean;
}

export interface P2pSignalMessage {
  type: "p2p_signal";
  signal:
  | { readonly kind: "offer"; readonly sdp: string }
  | { readonly kind: "answer"; readonly sdp: string }
  | { readonly kind: "candidate"; readonly candidate: string; readonly sdpMid: string | null; readonly sdpMLineIndex: number | null };
}

export interface P2pReadyMessage {
  type: "p2p_ready";
}

export interface InputFrameMessage {
  type: "input_frame";
  frame: number;
  ackFrame: number;
  moveX: -1 | 0 | 1;
  moveY: -1 | 0 | 1;
  aimX: number;
  aimY: number;
  shootPressed: boolean;
  bombPressed: boolean;
  activeCardPressed: boolean;
  reloadPressed: boolean;
  alternateHeld: boolean;
  infoHeld: boolean;
  transitionReadyPressed?: boolean;
  shopReadyPressed?: boolean;
  shopPurchaseItemId?: string;
  UnreliableLinkExtra?: UnreliableLinkExtra;
}

export interface SpectatorInputFrameMessage extends Omit<InputFrameMessage, "type"> {
  type: "spectator_input_frame";
  playerId: PlayerId;
}

export interface UnreliableLinkExtra {
  readonly redundantInputs: readonly RedundantInputFrame[];
}

export interface RedundantInputFrame {
  readonly frame: number;
  readonly moveX: -1 | 0 | 1;
  readonly moveY: -1 | 0 | 1;
  readonly aimX: number;
  readonly aimY: number;
  readonly shootPressed: boolean;
  readonly bombPressed: boolean;
  readonly activeCardPressed: boolean;
  readonly reloadPressed: boolean;
  readonly alternateHeld: boolean;
  readonly infoHeld: boolean;
  readonly transitionReadyPressed?: boolean;
  readonly shopReadyPressed?: boolean;
  readonly shopPurchaseItemId?: string;
}

export interface GameOverMessage {
  type: "game_over";
  frame: number;
  ackFrame: number;
  winnerPlayerId: PlayerId;
}

export interface PingMessage {
  type: "ping";
  seq: number;
}

export type ClientMessage =
  | HelloMessage
  | CreateRoomMessage
  | JoinRoomMessage
  | QuickMatchMessage
  | ListRoomsMessage
  | LeaveRoomMessage
  | StartGameMessage
  | LobbyReadyMessage
  | ReadyMessage
  | LoadingDoneMessage
  | P2pIntentMessage
  | P2pSignalMessage
  | P2pReadyMessage
  | InputFrameMessage
  | SpectatorInputFrameMessage
  | GameOverMessage
  | PingMessage;

// ──────────────────────────────────────────
// Server → Client Messages
// ──────────────────────────────────────────

export interface ServerHelloMessage {
  type: "server_hello";
  serverVersion: string;
}

export interface RoomListMessage {
  type: "room_list";
  rooms: RoomSummary[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface RoomCreatedMessage {
  type: "room_created";
  roomId: string;
  seed?: number;
}

export interface RoomJoinedMessage {
  type: "room_joined";
  roomId: string;
  playerId?: PlayerId;
  spectator?: boolean;
  battleMode?: BattleRoomMode;
  seed?: number;
}

export interface RoomStateMessage {
  type: "room_state";
  roomId: string;
  playerCount: number;
  status: RoomStatus;
  opponentUsername?: string;
  opponentReady?: boolean;
  roomName?: string;
  hostName?: string;
  lifeCount?: number;
  costLimit?: number;
  battleMode?: BattleRoomMode;
  allowSpectators?: boolean;
  spectatorCount?: number;
  spectatorNames?: readonly string[];
  playerNames?: readonly string[];
}

export interface GameStartingMessage {
  type: "game_starting";
  battleMode?: BattleRoomMode;
}

export interface OpponentReadyMessage {
  type: "opponent_ready";
}

export interface BattleStartMessage {
  type: "battle_start";
  config: BattleConfig;
}

export interface InputFrameRelayMessage {
  type: "input_frame";
  playerId: PlayerId;
  frame: number;
  ackFrame: number;
  moveX: -1 | 0 | 1;
  moveY: -1 | 0 | 1;
  aimX: number;
  aimY: number;
  shootPressed: boolean;
  bombPressed: boolean;
  activeCardPressed: boolean;
  reloadPressed: boolean;
  alternateHeld: boolean;
  infoHeld: boolean;
  transitionReadyPressed?: boolean;
  shopReadyPressed?: boolean;
  shopPurchaseItemId?: string;
  UnreliableLinkExtra?: UnreliableLinkExtra;
}

export interface PeerP2pIntentMessage {
  type: "peer_p2p_intent";
  playerId: PlayerId;
  enabled: boolean;
}

export interface PeerP2pSignalMessage {
  type: "peer_p2p_signal";
  playerId: PlayerId;
  signal: P2pSignalMessage["signal"];
}

export interface PeerP2pReadyMessage {
  type: "peer_p2p_ready";
  playerId: PlayerId;
}

export interface PeerLoadingDoneMessage {
  type: "peer_loading_done";
  playerId: PlayerId;
}

export interface PeerStatusMessage {
  type: "peer_status";
  playerId: PlayerId;
  status: "connected" | "disconnected" | "reconnected";
}

export interface BattleFinishedMessage {
  type: "battle_finished";
  roomId: string;
  battleId: string;
  frame: number;
  confirmedFrame: number;
  winnerPlayerId: PlayerId;
}

export interface PeerGameOverMessage {
  type: "peer_game_over";
  playerId: PlayerId;
  frame: number;
  ackFrame: number;
  winnerPlayerId: PlayerId;
}

export interface ErrorMessage {
  type: "error";
  code: string;
  message: string;
}

export interface PongMessage {
  type: "pong";
  seq: number;
}

export type ServerMessage =
  | ServerHelloMessage
  | RoomListMessage
  | RoomCreatedMessage
  | RoomJoinedMessage
  | RoomStateMessage
  | OpponentReadyMessage
  | BattleStartMessage
  | GameStartingMessage
  | PeerP2pIntentMessage
  | PeerP2pSignalMessage
  | PeerP2pReadyMessage
  | PeerLoadingDoneMessage
  | InputFrameRelayMessage
  | PeerStatusMessage
  | PeerGameOverMessage
  | BattleFinishedMessage
  | ErrorMessage
  | PongMessage;
