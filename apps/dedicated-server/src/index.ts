import { createServer } from "node:http";

import { TICK_RATE } from "@repo/types";

const port = Number.parseInt(process.env.PORT ?? "8787", 10);

const server = createServer((request, response) => {
  if (request.url === "/health") {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ ok: true, tickRate: TICK_RATE }));
    return;
  }

  response.writeHead(404, { "content-type": "application/json" });
  response.end(JSON.stringify({ error: "not_found" }));
});

server.listen(port, () => {
  console.log(`Dedicated server listening on http://localhost:${port}`);
});
