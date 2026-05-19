import type {
  BattleConfig,
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
  password?: string;
  mapId: MapId;
  lifeCount: number;
  costLimit: number;
}

export interface JoinRoomMessage {
  type: "join_room";
  roomId: string;
  password?: string;
}

export interface QuickMatchMessage {
  type: "quick_match";
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
  | LeaveRoomMessage
  | StartGameMessage
  | LobbyReadyMessage
  | ReadyMessage
  | LoadingDoneMessage
  | InputFrameMessage
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
}

export interface RoomCreatedMessage {
  type: "room_created";
  roomId: string;
}

export interface RoomJoinedMessage {
  type: "room_joined";
  roomId: string;
  playerId: PlayerId;
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
}

export interface GameStartingMessage {
  type: "game_starting";
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
  | InputFrameRelayMessage
  | PeerStatusMessage
  | BattleFinishedMessage
  | ErrorMessage
  | PongMessage;
