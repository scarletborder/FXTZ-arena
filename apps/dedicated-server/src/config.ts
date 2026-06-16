import { APP_BUILD_LABEL } from "@repo/constants";

export interface ServerConfig {
  readonly port: number;
  readonly ipv4Host: string;
  readonly ipv6Host: string;
  readonly certPath?: string;
  readonly keyPath?: string;
  readonly pemDir?: string;
  readonly webTransport: boolean;
  readonly enableCollaborate: boolean;
  readonly maxPlayersPerRoom: 2;
  readonly maxRooms: number;
  readonly serverVersion: string;
}

export const DEFAULT_SERVER_CONFIG: ServerConfig = {
  port: Number.parseInt(process.env.PORT ?? "22334", 10),
  ipv4Host: process.env.IPV4_HOST ?? process.env.HOST ?? "0.0.0.0",
  ipv6Host: process.env.IPV6_HOST ?? "::",
  webTransport: false,
  enableCollaborate: false,
  maxPlayersPerRoom: 2,
  maxRooms: 100,
  serverVersion: APP_BUILD_LABEL,
};

type EnvLike = Readonly<Record<string, string | undefined>>;

export function createServerConfig(
  argv: readonly string[] = process.argv.slice(2),
  env: EnvLike = process.env,
): ServerConfig {
  let ipv4Host = env.IPV4_HOST ?? env.HOST ?? "0.0.0.0";
  let ipv6Host = env.IPV6_HOST ?? "::";
  let port = parsePort(env.PORT ?? "22334");
  let certPath: string | undefined;
  let keyPath: string | undefined;
  let pemDir: string | undefined;
  let webTransport = false;
  let enableCollaborate = false;
  let maxRooms = DEFAULT_SERVER_CONFIG.maxRooms;

  for (const arg of argv) {
    if (arg === "--wt") {
      webTransport = true;
      continue;
    }

    if (arg === "--enable-collaborate") {
      enableCollaborate = true;
      continue;
    }

    const ipv4 = readOption(arg, "--ipv4");
    if (ipv4 !== null) {
      ipv4Host = ipv4;
      continue;
    }

    const ipv6 = readOption(arg, "--ipv6");
    if (ipv6 !== null) {
      ipv6Host = ipv6;
      continue;
    }

    const portArg = readOption(arg, "--port");
    if (portArg !== null) {
      port = parsePort(portArg);
      continue;
    }

    const cert = readOption(arg, "--cert");
    if (cert !== null) {
      certPath = cert;
      continue;
    }

    const key = readOption(arg, "--key") ?? readOption(arg, "key");
    if (key !== null) {
      keyPath = key;
      continue;
    }

    const pemDirArg = readOption(arg, "--pem-dir") ?? readOption(arg, "---pem-dir");
    if (pemDirArg !== null) {
      pemDir = pemDirArg;
      continue;
    }

    const maxRoomArg = readOption(arg, "--max-room");
    if (maxRoomArg !== null) {
      maxRooms = parseMaxRooms(maxRoomArg);
    }
  }

  return {
    ...DEFAULT_SERVER_CONFIG,
    ipv4Host,
    ipv6Host,
    port,
    certPath,
    keyPath,
    pemDir,
    webTransport,
    enableCollaborate,
    maxRooms,
  };
}

function readOption(arg: string, name: string): string | null {
  const prefix = `${name}=`;
  if (!arg.startsWith(prefix)) {
    return null;
  }
  return arg.slice(prefix.length).trim();
}

function parsePort(raw: string): number {
  const port = Number.parseInt(raw, 10);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid port: ${raw}`);
  }
  return port;
}

function parseMaxRooms(raw: string): number {
  const maxRooms = Number.parseInt(raw, 10);
  if (!Number.isInteger(maxRooms) || maxRooms < 1) {
    throw new Error(`Invalid max room: ${raw}`);
  }
  return maxRooms;
}
