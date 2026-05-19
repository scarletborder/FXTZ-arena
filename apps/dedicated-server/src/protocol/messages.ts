import type {
  BattleConfig,
  MapId,
  PlayerId,
  PlayerLoadout,
  RoomStatus,
} from "@repo/types";

// ──────────────────────────────────────────
// Client → Server Messages
// ──────────────────────────────────────────

export interface HelloMessage {
  type: "hello";
  username: string;
  clientVersion: string;
  debug: boolean;
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
  | ReadyMessage
  | LoadingDoneMessage
  | InputFrameMessage
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
  rooms: import("@repo/types").RoomSummary[];
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
  | InputFrameRelayMessage
  | PeerStatusMessage
  | ErrorMessage
  | PongMessage;
