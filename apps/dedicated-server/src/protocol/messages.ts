/**
 * Protocol message types — re-exported from @repo/types (canonical source).
 *
 * The client (frontend) and server share these type definitions via @repo/types,
 * ensuring the wire protocol contract stays in sync between both sides.
 */
export type {
  BattleStartMessage,
  BattleFinishedMessage,
  ClientMessage,
  CreateRoomMessage,
  ErrorMessage,
  GameStartingMessage,
  GameOverMessage,
  HelloMessage,
  InputFrameMessage,
  InputFrameRelayMessage,
  JoinRoomMessage,
  LeaveRoomMessage,
  ListRoomsMessage,
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
