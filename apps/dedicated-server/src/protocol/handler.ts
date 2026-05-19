import { validateLoadout, type BattleConfig } from "@repo/types";

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
  InputFrameMessage,
  JoinRoomMessage,
  PingMessage,
  ReadyMessage,
  ServerMessage,
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
} as const;

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
      case "ready":
        return this.handleReady(connection, raw as ReadyMessage);
      case "loading_done":
        return this.handleLoadingDone(connection);
      case "input_frame":
        return this.handleInputFrame(connection, raw as InputFrameMessage);
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
        // Notify the other player
        const otherIdx = room.connectionIds.findIndex(
          (c) => c && c !== connectionId,
        );
        if (otherIdx !== -1 && session.playerId) {
          this.sendToSlot(room, otherIdx, {
            type: "peer_status",
            playerId: session.playerId,
            status: "disconnected",
          });
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

    this.send(connection, {
      type: "room_state",
      roomId: room.id,
      playerCount: 2,
      status: room.status,
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
        status: "selecting",
        opponentUsername: session.username,
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

    this.send(connection, {
      type: "room_state",
      roomId: match.id,
      playerCount: 2,
      status: match.status,
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
        status: "selecting",
        opponentUsername: session.username,
      });
    }
  }

  // ─── Leave Room ───────────────────────────────────

  private handleLeaveRoom(connection: TransportConnection): void {
    const session = this.sessionStore.get(connection.id);
    if (!session || !session.roomId) {
      this.send(connection, {
        type: "error",
        code: ErrorCodes.NOT_IN_ROOM,
        message: "You are not in a room",
      });
      return;
    }

    const room = this.roomManager.get(session.roomId);
    if (!room) return;

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
        status: "waiting",
      });
    }

    this.roomManager.removePlayer(room, connection.id);

    if (room.connectionIds.every((c) => c === null)) {
      this.roomManager.delete(room.id);
    }

    this.sessionStore.setRoomId(connection.id, null);
    this.sessionStore.setPlayerId(connection.id, null!); // will be re-set on next join
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

    if (room.status !== "waiting" && room.status !== "selecting") {
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
      const configWithUsernames: BattleConfig = {
        ...result.battleConfig,
        players: [
          {
            ...result.battleConfig.players[0],
            username: this.sessionStore.get(room.connectionIds[0]!)?.username ?? "",
          },
          {
            ...result.battleConfig.players[1],
            username: this.sessionStore.get(room.connectionIds[1]!)?.username ?? "",
          },
        ],
      };

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
}
