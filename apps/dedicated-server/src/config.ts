import { APP_BUILD_LABEL } from "@repo/constants";

export interface ServerConfig {
  readonly port: number;
  readonly ipv4Host: string;
  readonly ipv6Host: string;
  readonly certPath?: string;
  readonly keyPath?: string;
  readonly maxPlayersPerRoom: 2;
  readonly maxRooms: number;
  readonly serverVersion: string;
}

export const DEFAULT_SERVER_CONFIG: ServerConfig = {
  port: Number.parseInt(process.env.PORT ?? "22334", 10),
  ipv4Host: process.env.IPV4_HOST ?? process.env.HOST ?? "0.0.0.0",
  ipv6Host: process.env.IPV6_HOST ?? "::",
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

  for (const arg of argv) {
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
    }
  }

  return {
    ...DEFAULT_SERVER_CONFIG,
    ipv4Host,
    ipv6Host,
    port,
    certPath,
    keyPath,
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
