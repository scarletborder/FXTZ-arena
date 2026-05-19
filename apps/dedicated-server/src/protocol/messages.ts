/**
 * Protocol message types — re-exported from @repo/types (canonical source).
 *
 * The client (frontend) and server share these type definitions via @repo/types,
 * ensuring the wire protocol contract stays in sync between both sides.
 */
export type {
  BattleStartMessage,
  ClientMessage,
  CreateRoomMessage,
  ErrorMessage,
  GameStartingMessage,
  HelloMessage,
  InputFrameMessage,
  InputFrameRelayMessage,
  JoinRoomMessage,
  LeaveRoomMessage,
  LoadingDoneMessage,
  LobbyReadyMessage,
  OpponentReadyMessage,
  PeerStatusMessage,
  PingMessage,
  PongMessage,
  QuickMatchMessage,
  ReadyMessage,
  RoomCreatedMessage,
  RoomJoinedMessage,
  RoomListMessage,
  RoomStateMessage,
  ServerHelloMessage,
  ServerMessage,
  StartGameMessage,
} from "@repo/types";
