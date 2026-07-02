const RESOURCE_CACHE_NAME = "fxtz-resource-files-v2";

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") {
    return;
  }

  const url = new URL(request.url);

  // ==========================================================
  // 💡 桌面端放行：若为 Tauri 原生安全协议或自定义本地主机名，绝不拦截！
  // ==========================================================
  if (
    url.protocol === "tauri:" ||
    url.protocol === "asset:" ||
    url.hostname === "asset.localhost" ||
    url.hostname === "tauri.localhost"
  ) {
    return;
  }

  if (!url.pathname.includes("/resource-assets/")) {
    return;
  }

  event.respondWith(serveFromCache(request));
});

async function serveFromCache(request) {
  const cache = await caches.open(RESOURCE_CACHE_NAME);
  const cached = await cache.match(request, { ignoreVary: true });
  if (cached) {
    return cached;
  }

  return fetch(request);
}