import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { createServerConfig } from "./config";
import { RoomLifecycle } from "./room/lifecycle";
import { RoomManager } from "./room/manager";
import { MessageHandler } from "./protocol/handler";
import { SessionStore } from "./session/store";
import { WsTransportServer } from "./transport/ws-server";

const config = createServerConfig();

console.log(`You are running FXTZ_area dedicated server.  Version:${config.serverVersion}`);

const roomManager = new RoomManager();
const roomLifecycle = new RoomLifecycle();
const sessionStore = new SessionStore();
const messageHandler = new MessageHandler(
  sessionStore,
  roomManager,
  roomLifecycle,
  config,
);

const listenHosts = [config.ipv4Host, config.ipv6Host];
if (Boolean(config.certPath) !== Boolean(config.keyPath)) {
  throw new Error("Both --cert=/path/to/cert.pem and --key=/path/to/key.pem are required to enable WSS/HTTPS.");
}
if ((config.certPath || config.keyPath) && config.pemDir) {
  throw new Error("Use either --cert/--key or --pem-dir, not both.");
}

const certificatePaths = config.certPath && config.keyPath
  ? { certPath: config.certPath, keyPath: config.keyPath, source: "custom" }
  : config.pemDir
    ? ensurePemDirCertificatePaths(config.pemDir)
    : undefined;
const tls = certificatePaths
  ? {
      cert: readFileSync(certificatePaths.certPath),
      key: readFileSync(certificatePaths.keyPath),
    }
  : undefined;

if (certificatePaths) {
  console.log(`TLS certificate: ${certificatePaths.source} (${certificatePaths.certPath})`);
} else {
  console.warn("TLS certificate: none. Falling back to plain WS/HTTP.");
}

const transport = new WsTransportServer(config.port, listenHosts, tls);

transport.onConnection((conn) => {
  messageHandler.registerConnection(conn);

  conn.onMessage((raw) => {
    messageHandler.handle(conn, raw);
  });

  conn.onClose(() => {
    messageHandler.handleDisconnect(conn.id);
  });

  conn.onError(() => {
    messageHandler.handleDisconnect(conn.id);
  });
});

const shutdown = () => {
  transport.close();
  process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

const protocol = tls ? "wss" : "ws";
const addrs = listenHosts.map((host) => `${protocol}://${formatHostForUrl(host)}:${config.port}`);
console.log(`Dedicated server listening on ${addrs.join(" and ")}`);
console.log(`HTTP echo endpoint: ${tls ? "https" : "http"}://${formatHostForUrl(listenHosts[0] ?? "localhost")}:${config.port}/echo`);

function formatHostForUrl(host: string): string {
  return host.includes(":") && !host.startsWith("[") ? `[${host}]` : host;
}

function ensurePemDirCertificatePaths(pemDir: string): { certPath: string; keyPath: string; source: "pem-dir" } {
  const certPath = join(pemDir, "cert.pem");
  const keyPath = join(pemDir, "key.pem");
  const hasCert = existsSync(certPath);
  const hasKey = existsSync(keyPath);

  if (hasCert && hasKey) {
    return { certPath, keyPath, source: "pem-dir" };
  }

  if (hasCert || hasKey) {
    throw new Error(`PEM directory must contain both cert.pem and key.pem, or neither. Directory: ${pemDir}`);
  }

  mkdirSync(pemDir, { recursive: true });
  console.log(`PEM directory has no certificate pair. Generating self-signed certificate in ${pemDir}`);
  const result = spawnSync("openssl", [
    "req",
    "-x509",
    "-newkey",
    "rsa:2048",
    "-keyout",
    keyPath,
    "-out",
    certPath,
    "-days",
    "365",
    "-nodes",
    "-subj",
    "/CN=localhost",
  ], { stdio: "inherit" });

  if (result.error) {
    throw new Error(`Failed to run openssl: ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(`openssl exited with code ${result.status ?? "unknown"}.`);
  }

  return { certPath, keyPath, source: "pem-dir" };
}
