import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import { createServerConfig } from "./config";
import { RoomLifecycle } from "./room/lifecycle";
import { RoomManager } from "./room/manager";
import { MessageHandler } from "./protocol/handler";
import { SessionStore } from "./session/store";
import type { TransportServer } from "./transport/interface";
import type { WsTransportTlsOptions } from "./transport/ws-server";
import { WtTransportServer } from "./transport/wt-server";
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
const cert = certificatePaths ? readFileSync(certificatePaths.certPath) : undefined;
const fingerprint = certificatePaths && cert ? getCertificateFingerprint(cert) : undefined;
if (certificatePaths && cert && fingerprint) {
  writeCertificateFingerprint(certificatePaths.certPath, fingerprint);
}
const tls = certificatePaths && cert
  ? {
    cert,
    key: readFileSync(certificatePaths.keyPath),
  }
  : undefined;

if (certificatePaths) {
  console.log(`TLS certificate: ${certificatePaths.source} (${certificatePaths.certPath})`);
} else {
  console.warn("TLS certificate: none. Falling back to plain WS/HTTP.");
}

if (config.webTransport && !tls) {
  throw new Error("WebTransport requires TLS. Provide --cert/--key or --pem-dir together with --wt.");
}

const transports: TransportServer[] = [
  new WsTransportServer(config.port, listenHosts, tls, {
    fingerprint,
    webTransportEnabled: config.webTransport,
  }),
];
if (config.webTransport && tls) {
  transports.push(new WtTransportServer(config.port, listenHosts, tls satisfies WsTransportTlsOptions));
}

const registerTransport = (transport: TransportServer) => transport.onConnection((conn) => {
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
transports.forEach(registerTransport);

const shutdown = () => {
  transports.forEach((transport) => transport.close());
  process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

const protocol = tls ? "wss" : "ws";
const addrs = listenHosts.map((host) => `${protocol}://${formatHostForUrl(host)}:${config.port}`);
console.log(`Dedicated server listening on ${addrs.join(" and ")}`);
console.log(`HTTP echo endpoint: ${tls ? "https" : "http"}://${formatHostForUrl(listenHosts[0] ?? "localhost")}:${config.port}/echo`);
if (config.webTransport) {
  console.log(`WebTransport endpoint: https://${formatHostForUrl(listenHosts[0] ?? "localhost")}:${config.port}/wt`);
}

function formatHostForUrl(host: string): string {
  return host.includes(":") && !host.startsWith("[") ? `[${host}]` : host;
}

function getCertificateFingerprint(cert: Buffer): string {
  return createHash("sha256").update(certificateDerBytes(cert)).digest("hex").toUpperCase();
}

function writeCertificateFingerprint(certPath: string, fingerprint: string): void {
  const fingerprintPath = join(dirname(certPath), "fingerprint.txt");
  writeFileSync(fingerprintPath, `${fingerprint}\n`, "utf8");
  console.log(`TLS certificate fingerprint: ${fingerprint} (${fingerprintPath})`);
}

function certificateDerBytes(cert: Buffer): Buffer {
  const pem = cert.toString("utf8");
  const match = /-----BEGIN CERTIFICATE-----([\s\S]+?)-----END CERTIFICATE-----/.exec(pem);
  if (!match) {
    return cert;
  }

  return Buffer.from(match[1].replace(/\s/g, ""), "base64");
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
