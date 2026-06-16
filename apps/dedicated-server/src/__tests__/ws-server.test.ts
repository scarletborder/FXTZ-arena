import { createServer } from "node:net";
import { describe, expect, it } from "vitest";

import { WsTransportServer } from "../transport/ws-server";

describe("WsTransportServer", () => {
  it("serves /echo over the underlying HTTP server", async () => {
    const port = await getFreePort();
    const transport = new WsTransportServer(port, ["127.0.0.1"]);

    try {
      const response = await fetch(`http://127.0.0.1:${port}/echo`);

      expect(response.status).toBe(200);
      expect(await response.text()).toContain("FXTZ arena dedicated server echo ok");
    } finally {
      transport.close();
    }
  });

  it("serves /version over the underlying HTTP server", async () => {
    const port = await getFreePort();
    const transport = new WsTransportServer(port, ["127.0.0.1"], undefined, {
      webTransportEnabled: true,
      version: "test-build",
      collaborateEnabled: true,
    });

    try {
      const response = await fetch(`http://127.0.0.1:${port}/version`);

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        version: "test-build",
        webTransport: true,
        collaborate: true,
      });
    } finally {
      transport.close();
    }
  });
});

function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (address === null || typeof address === "string") {
        server.close();
        reject(new Error("Failed to allocate a TCP port."));
        return;
      }
      server.close(() => {
        resolve(address.port);
      });
    });
  });
}
