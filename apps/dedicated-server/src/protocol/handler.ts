import { validateLoadout, type BattleConfig, type PlayerId } from "@repo/types";

import type { ServerConfig } from "../config";
import { findQuickMatchRoom } from "../matchmaking";
import type { RoomLifecycle } from "../room/lifecycle";
import type { RoomManager } from "../room/manager";
import type { SessionStore } from "../session/store";
import type { TransportConnection } from "../transport/interface";

import type {
  ClientMessage,
  CreateRoomMessage,
  HelloMessage,
  GameOverMessage,
  InputFrameMessage,
  JoinRoomMessage,
  LobbyReadyMessage,
  PingMessage,
  ReadyMessage,
  ServerMessage,
  StartGameMessage,
} from "./messages";

export const ErrorCodes = {
  HELLO_REQUIRED: "hello_required",
  ALREADY_IN_ROOM: "already_in_room",
  NOT_IN_ROOM: "not_in_room",
  ROOM_FULL: "room_full",
  ROOM_NOT_FOUND: "room_not_found",
  WRONG_PASSWORD: "wrong_password",
  INVALID_LOADOUT: "invalid_loadout",
  INVALID_STATE: "invalid_state",
  INVALID_MESSAGE: "invalid_message",
  RECONNECT_FAILED: "reconnect_failed",
} as const;

const DISCONNECT_GRACE_MS = 1_000;

/**
 * Routes and processes all client → server protocol messages.
 * Maintains a registry of active connections for outbound sends.
 */
export class MessageHandler {
  private connections = new Map<string, TransportConnection>();
  private helloReceived = new Set<string>();

  constructor(
    private sessionStore: SessionStore,
    private roomManager: RoomManager,
    private roomLifecycle: RoomLifecycle,
    private config: ServerConfig,
  ) {}

  registerConnection(conn: TransportConnection): void {
    this.connections.set(conn.id, conn);
  }

  unregisterConnection(connectionId: string): void {
    this.connections.delete(connectionId);
    this.helloReceived.delete(connectionId);
  }

  handle(connection: TransportConnection, raw: unknown): void {
    if (!raw || typeof raw !== "object") {
      this.send(connection, {
        type: "error",
        code: ErrorCodes.INVALID_MESSAGE,
        message: "Message must be a JSON object",
      });
      return;
    }

    const msg = raw as Record<string, unknown>;

    if (typeof msg.type !== "string") {
      this.send(connection, {
        type: "error",
        code: ErrorCodes.INVALID_MESSAGE,
        message: "Message must have a 'type' field",
      });
      return;
    }

    // hello is required before any other message type
    if (msg.type !== "hello" && !this.helloReceived.has(connection.id)) {
      this.send(connection, {
        type: "error",
        code: ErrorCodes.HELLO_REQUIRED,
        message: "Send 'hello' first to authenticate",
      });
      return;
    }

    switch (msg.type as ClientMessage["type"]) {
      case "hello":
        return this.handleHello(connection, raw as HelloMessage);
      case "create_room":
        return this.handleCreateRoom(connection, raw as CreateRoomMessage);
      case "join_room":
        return this.handleJoinRoom(connection, raw as JoinRoomMessage);
      case "quick_match":
        return this.handleQuickMatch(connection);
      case "leave_room":
        return this.handleLeaveRoom(connection);
      case "start_game":
        return this.handleStartGame(connection, raw as StartGameMessage);
      case "lobby_ready":
        return this.handleLobbyReady(connection, raw as LobbyReadyMessage);
      case "ready":
        return this.handleReady(connection, raw as ReadyMessage);
      case "loading_done":
        return this.handleLoadingDone(connection);
      case "input_frame":
        return this.handleInputFrame(connection, raw as InputFrameMessage);
      case "game_over":
        return this.handleGameOver(connection, raw as GameOverMessage);
      case "ping":
        return this.handlePing(connection, raw as PingMessage);
      default:
        this.send(connection, {
          type: "error",
          code: ErrorCodes.INVALID_MESSAGE,
          message: `Unknown message type: ${String(msg.type)}`,
        });
    }
  }

  handleDisconnect(connectionId: string): void {
    const session = this.sessionStore.get(connectionId);
    this.helloReceived.delete(connectionId);
    this.connections.delete(connectionId);

    if (!session) return;

    session.connected = false;

    if (session.roomId) {
      const room = this.roomManager.get(session.roomId);
      if (room) {
        const slotIdx = room.connectionIds.indexOf(connectionId);
        if (slotIdx !== -1 && session.playerId && (room.status === "loading" || room.status === "fighting")) {
          room.connectionIds[slotIdx] = null;
          room.disconnectedAt[slotIdx] = Date.now();
          this.notifyPeerStatus(room, slotIdx, session.playerId, "disconnected");

          room.disconnectTimers[slotIdx] = setTimeout(() => {
            if (room.connectionIds[slotIdx] !== null || room.disconnectedAt[slotIdx] === null) {
              return;
            }
            const playerId = room.playerSlots[slotIdx];
            this.roomManager.removeSlot(room, slotIdx);
            if (playerId) {
              this.notifyAllConnected(room, {
                type: "peer_status",
                playerId,
                status: "disconnected",
              });
            }
            // Collect remaining connections before cleanup
            const remainingConnIds = room.connectionIds.filter((c): c is string => c !== null);

            this.notifyAllConnected(room, {
              type: "room_state",
              roomId: room.id,
              playerCount: remainingConnIds.length,
              status: room.status,
              roomName: room.name,
              hostName: this.hostName(room),
              lifeCount: room.lifeCount,
              costLimit: room.costLimit,
            });

            // Clean up remaining players' sessions so they can create/join new rooms
            for (const connId of remainingConnIds) {
              this.sessionStore.setRoomId(connId, null);
              this.sessionStore.setPlayerId(connId, null!);
              this.roomManager.removePlayer(room, connId);
            }

            if (room.connectionIds.every((c) => c === null)) {
              this.roomManager.delete(room.id);
            }
            this.sessionStore.remove(connectionId);
          }, DISCONNECT_GRACE_MS);
          return;
        }

        if (slotIdx !== -1 && session.playerId) {
          this.notifyPeerStatus(room, slotIdx, session.playerId, "disconnected");
          const otherIdx = slotIdx === 0 ? 1 : 0;
          const otherConnId = room.connectionIds[otherIdx];
          const remainingSession = otherConnId ? this.sessionStore.get(otherConnId) : undefined;
          this.sendToSlot(room, otherIdx, {
            type: "room_state",
            roomId: room.id,
            playerCount: 1,
            status: "waiting",
            roomName: room.name,
            hostName: remainingSession?.username ?? "",
            lifeCount: room.lifeCount,
            costLimit: room.costLimit,
          });

          // Clean up remaining player: remove from room and clear session
          if (otherConnId) {
            this.sessionStore.setRoomId(otherConnId, null);
            this.sessionStore.setPlayerId(otherConnId, null!);
            this.roomManager.removePlayer(room, otherConnId);
          }
        }

        this.roomManager.removePlayer(room, connectionId);

        // Delete empty rooms
        if (room.connectionIds.every((c) => c === null)) {
          this.roomManager.delete(room.id);
        }
      }
    }

    this.sessionStore.remove(connectionId);
  }

  // ─── Hello ────────────────────────────────────────

  private handleHello(connection: TransportConnection, msg: HelloMessage): void {
    if (this.helloReceived.has(connection.id)) return; // idempotent

    this.helloReceived.add(connection.id);

    if (msg.reconnect && this.tryReconnect(connection, msg)) {
      return;
    }

    this.sessionStore.create(
      connection.id,
      msg.username,
      msg.clientVersion,
      msg.debug,
    );

    this.send(connection, {
      type: "server_hello",
      serverVersion: this.config.serverVersion,
    });
  }

  private tryReconnect(connection: TransportConnection, msg: HelloMessage): boolean {
    const reconnect = msg.reconnect;
    if (!reconnect) return false;

    const room = this.roomManager.get(reconnect.roomId);
    const slotIndex = room?.playerSlots.indexOf(reconnect.playerId) ?? -1;
    const battleMatches = !reconnect.battleId || room?.battleId === reconnect.battleId;
    const canReconnect = !!room
      && slotIndex !== -1
      && room.connectionIds[slotIndex] === null
      && room.disconnectedAt[slotIndex] !== null
      && (room.status === "loading" || room.status === "fighting")
      && battleMatches;

    if (!room || !canReconnect) {
      this.sessionStore.create(connection.id, msg.username, msg.clientVersion, msg.debug);
      this.send(connection, {
        type: "server_hello",
        serverVersion: this.config.serverVersion,
      });
      this.send(connection, {
        type: "error",
        code: ErrorCodes.RECONNECT_FAILED,
        message: "Reconnect window expired",
      });
      return true;
    }

    const oldSession = this.sessionStore.findByRoomAndPlayer(room.id, reconnect.playerId);
    if (oldSession && oldSession.connectionId !== connection.id) {
      this.sessionStore.remove(oldSession.connectionId);
    }

    this.sessionStore.create(connection.id, msg.username, msg.clientVersion, msg.debug);
    this.sessionStore.setRoomId(connection.id, room.id);
    this.sessionStore.setPlayerId(connection.id, reconnect.playerId);
    this.roomManager.reconnectSlot(room, slotIndex, connection.id);

    this.send(connection, {
      type: "server_hello",
      serverVersion: this.config.serverVersion,
    });
    this.send(connection, {
      type: "room_joined",
      roomId: room.id,
      playerId: reconnect.playerId,
    });

    const config = this.buildBattleConfig(room);
    if (config) {
      this.send(connection, {
        type: "battle_start",
        config,
      });
    }

    this.send(connection, {
      type: "room_state",
      roomId: room.id,
      playerCount: room.connectionIds.filter(Boolean).length,
      status: room.status,
      opponentUsername: this.opponentName(room, slotIndex),
      roomName: room.name,
      hostName: this.hostName(room),
      lifeCount: room.lifeCount,
      costLimit: room.costLimit,
    });
    this.notifyPeerStatus(room, slotIndex, reconnect.playerId, "reconnected");
    return true;
  }

  // ─── Create Room ──────────────────────────────────

  private handleCreateRoom(
    connection: TransportConnection,
    msg: CreateRoomMessage,
  ): void {
    const session = this.sessionStore.get(connection.id);
    if (!session) return;

    if (session.roomId) {
      this.send(connection, {
        type: "error",
        code: ErrorCodes.ALREADY_IN_ROOM,
        message: "You are already in a room",
      });
      return;
    }

    if (this.roomManager.count() >= this.config.maxRooms) {
      this.send(connection, {
        type: "error",
        code: ErrorCodes.INVALID_STATE,
        message: "Server is full",
      });
      return;
    }

    const room = this.roomManager.create({
      name: msg.name || `${session.username}'s room`,
      password: msg.password,
      mapId: msg.mapId,
      lifeCount: msg.lifeCount,
      costLimit: msg.costLimit,
    });

    const assignment = this.roomManager.assignSlot(room, connection.id);
    if (!assignment) {
      this.roomManager.delete(room.id);
      this.send(connection, {
        type: "error",
        code: ErrorCodes.ROOM_FULL,
        message: "Room is full",
      });
      return;
    }

    this.sessionStore.setRoomId(connection.id, room.id);
    this.sessionStore.setPlayerId(connection.id, assignment.playerId);

    this.send(connection, {
      type: "room_created",
      roomId: room.id,
    });

    this.send(connection, {
      type: "room_joined",
      roomId: room.id,
      playerId: assignment.playerId,
    });

    this.send(connection, {
      type: "room_state",
      roomId: room.id,
      playerCount: 1,
      status: room.status,
      roomName: room.name,
      hostName: session.username,
      lifeCount: room.lifeCount,
      costLimit: room.costLimit,
    });
  }

  // ─── Join Room ────────────────────────────────────

  private handleJoinRoom(
    connection: TransportConnection,
    msg: JoinRoomMessage,
  ): void {
    const session = this.sessionStore.get(connection.id);
    if (!session) return;

    if (session.roomId) {
      this.send(connection, {
        type: "error",
        code: ErrorCodes.ALREADY_IN_ROOM,
        message: "Leave your current room first",
      });
      return;
    }

    const room = this.roomManager.get(msg.roomId);
    if (!room) {
      this.send(connection, {
        type: "error",
        code: ErrorCodes.ROOM_NOT_FOUND,
        message: `Room ${msg.roomId} not found`,
      });
      return;
    }

    if (room.password && room.password !== (msg.password ?? "")) {
      this.send(connection, {
        type: "error",
        code: ErrorCodes.WRONG_PASSWORD,
        message: "Incorrect password",
      });
      return;
    }

    const openSlot = this.roomManager.getOpenSlotIndex(room);
    if (openSlot === -1) {
      this.send(connection, {
        type: "error",
        code: ErrorCodes.ROOM_FULL,
        message: "Room is already full",
      });
      return;
    }

    const assignment = this.roomManager.assignSlot(room, connection.id);
    if (!assignment) {
      this.send(connection, {
        type: "error",
        code: ErrorCodes.ROOM_FULL,
        message: "Room is full",
      });
      return;
    }

    this.sessionStore.setRoomId(connection.id, room.id);
    this.sessionStore.setPlayerId(connection.id, assignment.playerId);

    this.send(connection, {
      type: "room_joined",
      roomId: room.id,
      playerId: assignment.playerId,
    });

    // Get host info for lobby display
    const hostSession = this.sessionStore.get(room.connectionIds[0]!);

    this.send(connection, {
      type: "room_state",
      roomId: room.id,
      playerCount: 2,
      status: room.status,
      opponentUsername: hostSession?.username ?? "",
      roomName: room.name,
      hostName: hostSession?.username ?? "",
      lifeCount: room.lifeCount,
      costLimit: room.costLimit,
    });

    // Notify the other player about room state change
    const otherIdx = assignment.slotIndex === 0 ? 1 : 0;
    const otherConnId = room.connectionIds[otherIdx];
    if (otherConnId) {
      const otherSession = this.sessionStore.get(otherConnId);
      this.sendToConnection(otherConnId, {
        type: "room_state",
        roomId: room.id,
        playerCount: 2,
        status: room.status,
        opponentUsername: session.username,
        opponentReady: false,
        roomName: room.name,
        hostName: otherSession?.username ?? "",
        lifeCount: room.lifeCount,
        costLimit: room.costLimit,
      });
    }
  }

  // ─── Quick Match ──────────────────────────────────

  private handleQuickMatch(connection: TransportConnection): void {
    const session = this.sessionStore.get(connection.id);
    if (!session) return;

    if (session.roomId) {
      this.send(connection, {
        type: "error",
        code: ErrorCodes.ALREADY_IN_ROOM,
        message: "Leave your current room first",
      });
      return;
    }

    const rooms = this.roomManager.getAllRooms();
    const match = findQuickMatchRoom(rooms);

    if (!match) {
      this.send(connection, {
        type: "error",
        code: ErrorCodes.ROOM_NOT_FOUND,
        message: "No available rooms for quick match",
      });
      return;
    }

    const assignment = this.roomManager.assignSlot(match, connection.id);
    if (!assignment) {
      this.send(connection, {
        type: "error",
        code: ErrorCodes.ROOM_FULL,
        message: "Room became full",
      });
      return;
    }

    this.sessionStore.setRoomId(connection.id, match.id);
    this.sessionStore.setPlayerId(connection.id, assignment.playerId);

    this.send(connection, {
      type: "room_joined",
      roomId: match.id,
      playerId: assignment.playerId,
    });

    const hostSession = this.sessionStore.get(match.connectionIds[0]!);

    this.send(connection, {
      type: "room_state",
      roomId: match.id,
      playerCount: 2,
      status: match.status,
      opponentUsername: hostSession?.username ?? "",
      roomName: match.name,
      hostName: hostSession?.username ?? "",
      lifeCount: match.lifeCount,
      costLimit: match.costLimit,
    });

    // Notify the other player
    const otherIdx = assignment.slotIndex === 0 ? 1 : 0;
    const otherConnId = match.connectionIds[otherIdx];
    if (otherConnId) {
      const otherSession = this.sessionStore.get(otherConnId);
      this.sendToConnection(otherConnId, {
        type: "room_state",
        roomId: match.id,
        playerCount: 2,
        status: match.status,
        opponentUsername: session.username,
        opponentReady: false,
        roomName: match.name,
        hostName: otherSession?.username ?? "",
        lifeCount: match.lifeCount,
        costLimit: match.costLimit,
      });
    }
  }

  // ─── Leave Room ───────────────────────────────────

  private handleLeaveRoom(connection: TransportConnection): void {
    const session = this.sessionStore.get(connection.id);
    if (!session || !session.roomId) {
      // Already left or cleaned up by server — silently succeed
      return;
    }

    const room = this.roomManager.get(session.roomId);
    if (!room) return;

    const exitsActiveBattle = room.status === "loading" || room.status === "fighting";
    if (exitsActiveBattle) {
      room.status = "finished";
    }

    // Notify other player
    const otherConnId = room.connectionIds.find(
      (c) => c && c !== connection.id,
    );
    if (otherConnId && session.playerId) {
      this.sendToConnection(otherConnId, {
        type: "peer_status",
        playerId: session.playerId,
        status: "disconnected",
      });

      this.sendToConnection(otherConnId, {
        type: "room_state",
        roomId: room.id,
        playerCount: 1,
        status: room.status,
        roomName: room.name,
        hostName: "",
        lifeCount: room.lifeCount,
        costLimit: room.costLimit,
      });
    }

    this.roomManager.removePlayer(room, connection.id);

    // Clean up the remaining player's session too so they can create/join new rooms
    if (otherConnId) {
      this.sessionStore.setRoomId(otherConnId, null);
      this.sessionStore.setPlayerId(otherConnId, null!);
      this.roomManager.removePlayer(room, otherConnId);
    }

    if (room.connectionIds.every((c) => c === null)) {
      this.roomManager.delete(room.id);
    }

    this.sessionStore.setRoomId(connection.id, null);
    this.sessionStore.setPlayerId(connection.id, null!);
  }

  // ─── Start Game ────────────────────────────────────

  private handleStartGame(
    connection: TransportConnection,
    _msg: StartGameMessage,
  ): void {
    const session = this.sessionStore.get(connection.id);
    if (!session || !session.roomId || !session.playerId) {
      this.send(connection, {
        type: "error",
        code: ErrorCodes.NOT_IN_ROOM,
        message: "You must be in a room",
      });
      return;
    }

    const room = this.roomManager.get(session.roomId);
    if (!room) return;

    if (session.playerId !== "player-1") {
      this.send(connection, {
        type: "error",
        code: ErrorCodes.INVALID_STATE,
        message: "Only the host can start the game",
      });
      return;
    }

    if (room.status !== "waiting") {
      this.send(connection, {
        type: "error",
        code: ErrorCodes.INVALID_STATE,
        message: `Cannot start in room state: ${room.status}`,
      });
      return;
    }

    if (room.connectionIds.some((c) => c === null)) {
      this.send(connection, {
        type: "error",
        code: ErrorCodes.INVALID_STATE,
        message: "Waiting for opponent to join",
      });
      return;
    }

    if (!room.lobbyReady[1]) {
      this.send(connection, {
        type: "error",
        code: ErrorCodes.INVALID_STATE,
        message: "Opponent is not ready",
      });
      return;
    }

    // Transition to selecting
    room.status = "selecting";
    room.lobbyReady = [false, false];

    // Broadcast game_starting to both players
    for (const connId of room.connectionIds) {
      if (connId) {
        this.sendToConnection(connId, {
          type: "game_starting",
        });
      }
    }
  }

  // ─── Lobby Ready ────────────────────────────────────

  private handleLobbyReady(
    connection: TransportConnection,
    msg: LobbyReadyMessage,
  ): void {
    const session = this.sessionStore.get(connection.id);
    if (!session || !session.roomId || !session.playerId) {
      this.send(connection, {
        type: "error",
        code: ErrorCodes.NOT_IN_ROOM,
        message: "You must be in a room",
      });
      return;
    }

    const room = this.roomManager.get(session.roomId);
    if (!room) return;

    if (room.status !== "waiting") {
      this.send(connection, {
        type: "error",
        code: ErrorCodes.INVALID_STATE,
        message: `Cannot toggle ready in room state: ${room.status}`,
      });
      return;
    }

    if (session.playerId !== "player-2") {
      return; // host doesn't use lobby ready
    }

    const idx = room.playerSlots.indexOf(session.playerId);
    if (idx === -1) return;

    room.lobbyReady[idx] = msg.ready;

    // Broadcast updated room_state to both players
    const hostSession = this.sessionStore.get(room.connectionIds[0]!);
    const guestSession = this.sessionStore.get(room.connectionIds[1]!);

    for (let i = 0; i < room.connectionIds.length; i++) {
      const connId = room.connectionIds[i];
      if (!connId) continue;

      this.sendToConnection(connId, {
        type: "room_state",
        roomId: room.id,
        playerCount: room.connectionIds.filter(Boolean).length,
        status: room.status,
        opponentUsername: i === 0 ? guestSession?.username : hostSession?.username,
        opponentReady: i === 0 ? room.lobbyReady[1] : undefined,
        roomName: room.name,
        hostName: hostSession?.username ?? "",
        lifeCount: room.lifeCount,
        costLimit: room.costLimit,
      });
    }
  }

  // ─── Ready ────────────────────────────────────────

  private handleReady(connection: TransportConnection, msg: ReadyMessage): void {
    const session = this.sessionStore.get(connection.id);
    if (!session || !session.roomId || !session.playerId) {
      this.send(connection, {
        type: "error",
        code: ErrorCodes.NOT_IN_ROOM,
        message: "You must be in a room to ready up",
      });
      return;
    }

    const room = this.roomManager.get(session.roomId);
    if (!room) return;

    if (room.status !== "selecting") {
      this.send(connection, {
        type: "error",
        code: ErrorCodes.INVALID_STATE,
        message: `Cannot ready in room state: ${room.status}`,
      });
      return;
    }

    // Validate loadout
    const validation = validateLoadout(msg.loadout, {
      mode: "standard",
      costLimit: room.costLimit,
    });
    if (!validation.valid) {
      this.send(connection, {
        type: "error",
        code: ErrorCodes.INVALID_LOADOUT,
        message: `Invalid loadout: ${validation.errors.join(", ")}`,
      });
      return;
    }

    const result = this.roomLifecycle.setReady(room, session.playerId, msg.loadout);

    // Notify opponent that this player is ready
    const otherIdx = room.playerSlots.indexOf(
      session.playerId === "player-1" ? "player-2" : "player-1",
    );
    if (otherIdx !== -1) {
      const otherConnId = room.connectionIds[otherIdx];
      if (otherConnId) {
        this.sendToConnection(otherConnId, {
          type: "opponent_ready",
        });
      }
    }

    if (result.bothReady) {
      // Both players ready — send battle_start to both
      const configWithUsernames = this.withUsernames(room, result.battleConfig);

      for (const connId of room.connectionIds) {
        if (connId) {
          this.sendToConnection(connId, {
            type: "battle_start",
            config: configWithUsernames,
          });
        }
      }
    }
  }

  // ─── Loading Done ─────────────────────────────────

  private handleLoadingDone(connection: TransportConnection): void {
    const session = this.sessionStore.get(connection.id);
    if (!session || !session.roomId || !session.playerId) {
      this.send(connection, {
        type: "error",
        code: ErrorCodes.NOT_IN_ROOM,
        message: "You must be in a room",
      });
      return;
    }

    const room = this.roomManager.get(session.roomId);
    if (!room) return;

    if (room.status !== "loading") {
      this.send(connection, {
        type: "error",
        code: ErrorCodes.INVALID_STATE,
        message: `Cannot finish loading in room state: ${room.status}`,
      });
      return;
    }

    const bothLoaded = this.roomLifecycle.setLoadingDone(room, session.playerId);

    if (bothLoaded) {
      // Both players loaded — fighting begins
      for (const connId of room.connectionIds) {
        if (connId) {
          this.sendToConnection(connId, {
            type: "room_state",
            roomId: room.id,
            playerCount: 2,
            status: "fighting",
          });
        }
      }
    }
  }

  // ─── Input Frame Relay ────────────────────────────

  private handleInputFrame(
    connection: TransportConnection,
    msg: InputFrameMessage,
  ): void {
    const session = this.sessionStore.get(connection.id);
    if (!session || !session.roomId || !session.playerId) {
      return; // silently drop — common during race conditions
    }

    const room = this.roomManager.get(session.roomId);
    if (!room || room.status !== "fighting") return;

    const ownIdx = room.playerSlots.indexOf(session.playerId);
    if (ownIdx !== -1) {
      room.lastAckFrameIds[ownIdx] = Math.max(room.lastAckFrameIds[ownIdx] ?? 0, msg.ackFrame ?? 0);
    }

    // Relay to the other player
    const otherIdx = room.playerSlots.indexOf(
      session.playerId === "player-1" ? "player-2" : "player-1",
    );
    if (otherIdx === -1) return;

    const otherConnId = room.connectionIds[otherIdx];
    if (!otherConnId) return;

    this.sendToConnection(otherConnId, {
      type: "input_frame",
      playerId: session.playerId,
      frame: msg.frame,
      ackFrame: msg.ackFrame ?? 0,
      moveX: msg.moveX,
      moveY: msg.moveY,
      aimX: msg.aimX,
      aimY: msg.aimY,
      shootPressed: msg.shootPressed,
      bombPressed: msg.bombPressed,
      activeCardPressed: msg.activeCardPressed,
      reloadPressed: msg.reloadPressed,
      alternateHeld: msg.alternateHeld,
      infoHeld: msg.infoHeld,
    });
  }

  // ─── Game Over Verdict ────────────────────────────

  private handleGameOver(
    connection: TransportConnection,
    msg: GameOverMessage,
  ): void {
    const session = this.sessionStore.get(connection.id);
    if (!session || !session.roomId || !session.playerId) return;

    const room = this.roomManager.get(session.roomId);
    if (!room || room.status !== "fighting" || !room.battleId) return;

    const ownIdx = room.playerSlots.indexOf(session.playerId);
    if (ownIdx === -1) return;

    room.lastAckFrameIds[ownIdx] = Math.max(room.lastAckFrameIds[ownIdx] ?? 0, msg.ackFrame);
    room.gameOverVerdicts[ownIdx] = {
      frame: msg.frame,
      winnerPlayerId: msg.winnerPlayerId,
    };

    const [left, right] = room.gameOverVerdicts;
    if (!left || !right) return;

    if (left.winnerPlayerId !== right.winnerPlayerId) {
      room.gameOverVerdicts = [null, null];
      return;
    }

    room.status = "finished";
    const finishedFrame = Math.max(left.frame, right.frame);
    this.notifyAllConnected(room, {
      type: "battle_finished",
      roomId: room.id,
      battleId: room.battleId,
      frame: finishedFrame,
      winnerPlayerId: left.winnerPlayerId,
    });
    this.notifyAllConnected(room, {
      type: "room_state",
      roomId: room.id,
      playerCount: room.connectionIds.filter(Boolean).length,
      status: room.status,
      roomName: room.name,
      hostName: this.hostName(room),
      lifeCount: room.lifeCount,
      costLimit: room.costLimit,
    });

    // Clean up all players' sessions so they can create/join new rooms after the match
    for (const connId of room.connectionIds) {
      if (connId) {
        this.sessionStore.setRoomId(connId, null);
        this.sessionStore.setPlayerId(connId, null!);
        this.roomManager.removePlayer(room, connId);
      }
    }
    this.roomManager.delete(room.id);
  }

  // ─── Ping / Pong ──────────────────────────────────

  private handlePing(connection: TransportConnection, msg: PingMessage): void {
    this.send(connection, {
      type: "pong",
      seq: msg.seq,
    });
  }

  // ─── Helpers ──────────────────────────────────────

  private send(connection: TransportConnection, message: ServerMessage): void {
    connection.send(message);
  }

  private sendToConnection(connectionId: string, message: ServerMessage): void {
    const conn = this.connections.get(connectionId);
    if (conn) {
      conn.send(message);
    }
  }

  private sendToSlot(room: { connectionIds: (string | null)[] }, slotIndex: number, message: ServerMessage): void {
    const connId = room.connectionIds[slotIndex];
    if (connId) {
      this.sendToConnection(connId, message);
    }
  }

  private notifyPeerStatus(
    room: { connectionIds: (string | null)[] },
    disconnectedSlotIndex: number,
    playerId: PlayerId,
    status: "connected" | "disconnected" | "reconnected",
  ): void {
    const otherIdx = disconnectedSlotIndex === 0 ? 1 : 0;
    this.sendToSlot(room, otherIdx, {
      type: "peer_status",
      playerId,
      status,
    });
  }

  private notifyAllConnected(room: { connectionIds: (string | null)[] }, message: ServerMessage): void {
    for (const connId of room.connectionIds) {
      if (connId) {
        this.sendToConnection(connId, message);
      }
    }
  }

  private buildBattleConfig(room: import("../room/types").InternalRoom): BattleConfig | null {
    if (!room.battleId || room.seed === null || !room.loadouts[0] || !room.loadouts[1] || !room.playerSlots[0] || !room.playerSlots[1]) {
      return null;
    }
    return this.withUsernames(room, {
      battleId: room.battleId,
      mapId: room.mapId,
      seed: room.seed,
      fps: 60,
      lifeCount: room.lifeCount,
      defaultBombCount: 3,
      costLimit: room.costLimit,
      players: [
        {
          playerId: room.playerSlots[0],
          username: "",
          loadout: room.loadouts[0],
          spawnPointId: "spawn-1",
        },
        {
          playerId: room.playerSlots[1],
          username: "",
          loadout: room.loadouts[1],
          spawnPointId: "spawn-2",
        },
      ],
    });
  }

  private withUsernames(room: import("../room/types").InternalRoom, config: BattleConfig): BattleConfig {
    const firstSession = room.connectionIds[0]
      ? this.sessionStore.get(room.connectionIds[0]!)
      : this.sessionStore.findByRoomAndPlayer(room.id, "player-1");
    const secondSession = room.connectionIds[1]
      ? this.sessionStore.get(room.connectionIds[1]!)
      : this.sessionStore.findByRoomAndPlayer(room.id, "player-2");
    return {
      ...config,
      players: [
        {
          ...config.players[0],
          username: firstSession?.username ?? "",
        },
        {
          ...config.players[1],
          username: secondSession?.username ?? "",
        },
      ],
    };
  }

  private hostName(room: import("../room/types").InternalRoom): string {
    const hostConnectionId = room.connectionIds[0];
    return hostConnectionId
      ? this.sessionStore.get(hostConnectionId)?.username ?? ""
      : this.sessionStore.findByRoomAndPlayer(room.id, "player-1")?.username ?? "";
  }

  private opponentName(room: import("../room/types").InternalRoom, ownSlotIndex: number): string {
    const otherIdx = ownSlotIndex === 0 ? 1 : 0;
    const otherConnectionId = room.connectionIds[otherIdx];
    const playerId = room.playerSlots[otherIdx];
    if (otherConnectionId) {
      return this.sessionStore.get(otherConnectionId)?.username ?? "";
    }
    return playerId ? this.sessionStore.findByRoomAndPlayer(room.id, playerId)?.username ?? "" : "";
  }
}
