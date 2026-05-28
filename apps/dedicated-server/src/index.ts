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

const transport = new WsTransportServer(config.port, config.host);

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

const addr = `ws://${formatHostForUrl(config.host)}:${config.port}`;
console.log(`Dedicated server listening on ${addr}`);

function formatHostForUrl(host: string): string {
  return host.includes(":") && !host.startsWith("[") ? `[${host}]` : host;
}
