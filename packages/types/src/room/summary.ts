import type { BattleRoomMode, MapId } from "../core";

export type RoomStatus =
  | "waiting"
  | "selecting"
  | "loading"
  | "fighting"
  | "finished";

export interface RoomSummary {
  readonly id: string;
  readonly name: string;
  readonly hostName?: string;
  readonly hasPassword: boolean;
  readonly battleMode: BattleRoomMode;
  readonly mapId: MapId;
  readonly lifeCount: number;
  readonly costLimit: number;
  readonly playerCount: number;
  readonly maxPlayers: 2;
  readonly status: RoomStatus;
  readonly allowSpectators?: boolean;
  readonly spectatorCount?: number;
}
