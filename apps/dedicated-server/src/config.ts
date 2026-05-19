export interface ServerConfig {
  readonly port: number;
  readonly host: string;
  readonly maxPlayersPerRoom: 2;
  readonly maxRooms: number;
  readonly serverVersion: string;
}

export const DEFAULT_SERVER_CONFIG: ServerConfig = {
  port: Number.parseInt(process.env.PORT ?? "22334", 10),
  host: process.env.HOST ?? "0.0.0.0",
  maxPlayersPerRoom: 2,
  maxRooms: 100,
  serverVersion: "0.1.0",
};
