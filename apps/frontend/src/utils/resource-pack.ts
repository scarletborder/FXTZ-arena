import { IS_DESKTOP_APP } from "@repo/constants";
import Phaser from "phaser";

const RESOURCE_CACHE_NAME = "fxtz-resource-files-v2";
const RESOURCE_MANIFEST_URL = "resource-manifest.json";
const RESOURCE_SERVICE_WORKER_URL = "resource-cache-sw.js";

export type ResourceManifestEntry = {
  readonly path: string;
  readonly outputPath: string;
  readonly hash: string;
  readonly size: number;
  readonly mime: string;
};

type ResourceManifest = {
  readonly version: number;
  readonly generatedAt?: string;
  readonly files: readonly ResourceManifestEntry[];
};

const resourceEntries = new Map<string, ResourceManifestEntry>();

export type ResourcePackPrepareStage = "checking" | "ready" | "downloading" | "fallback" | "error";

export interface ResourcePackPrepareProgress {
  readonly stage: ResourcePackPrepareStage;
  readonly downloadedBytes?: number;
  readonly totalBytes?: number;
}

export type ResourcePackPrepareProgressHandler = (progress: ResourcePackPrepareProgress) => void;

export async function prepareResourcePackSource(onProgress?: ResourcePackPrepareProgressHandler): Promise<void> {
  onProgress?.({ stage: "checking" });

  if (IS_DESKTOP_APP) {
    const manifest = await loadRemoteManifest();
    applyManifest(manifest);
    onProgress?.({ stage: "ready" });
    return;
  }

  if (!("caches" in window)) {
    const manifest = await loadRemoteManifest();
    applyManifest(manifest);
    onProgress?.({ stage: "ready" });
    return;
  }

  const cache = await caches.open(RESOURCE_CACHE_NAME);
  const cachedManifest = await readCachedManifest(cache);

  let remoteManifest;
  try {
    remoteManifest = await loadRemoteManifest();
  } catch (error) {
    if (cachedManifest && await isManifestCachedComplete(cache, cachedManifest)) {
      applyManifest(cachedManifest);
      onProgress?.({ stage: "fallback" });
      return;
    }
    onProgress?.({ stage: "error" });
    throw error;
  }

  applyManifest(remoteManifest);

  const serviceWorkerReady = await ensureResourceServiceWorker();
  if (!serviceWorkerReady) {
    onProgress?.({ stage: "ready" });
    return;
  }

  const downloads = await collectFilesToDownload(cache, remoteManifest, cachedManifest);
  const totalBytes = downloads.reduce((sum, file) => sum + file.size, 0);
  let downloadedBytes = 0;

  if (downloads.length > 0) {
    onProgress?.({ stage: "downloading", downloadedBytes, totalBytes });
  }

  try {
    for (const file of downloads) {
      const response = await fetch(resourcePublicUrl(file.outputPath), { cache: "no-cache" });
      if (!response.ok) {
        throw new Error(`Failed to fetch ${file.outputPath}: ${response.status}`);
      }

      const cachedResponse = await readResponseWithProgress(response, (chunkBytes) => {
        downloadedBytes += chunkBytes;
        onProgress?.({ stage: "downloading", downloadedBytes, totalBytes });
      });

      await cache.put(resourcePublicUrl(file.outputPath), cachedResponse);
    }

    await deleteStaleEntries(cache, remoteManifest);
    await cacheManifest(cache, remoteManifest);
    onProgress?.({ stage: "ready", downloadedBytes, totalBytes });
  } catch (error) {
    if (cachedManifest && await isManifestCachedComplete(cache, cachedManifest)) {
      applyManifest(cachedManifest);
      onProgress?.({ stage: "fallback" });
      return;
    }
    onProgress?.({ stage: "error" });
    throw error;
  }
}

export function queueResourcePack(scene: Phaser.Scene): void {
  void scene;
  // Resource files are served via URL + service worker now.
}

export function installResourcePackFromCache(scene: Phaser.Scene): void {
  void scene;
  // Resource files are served via URL + service worker now.
}

export function resourceAssetUrl(filePath: string): string | undefined {
  const entry = resourceEntries.get(normalizeResourceKey(filePath));
  if (!entry) {
    return undefined;
  }
  return resourcePublicUrl(entry.outputPath);
}

export function hasResourceAsset(filePath: string): boolean {
  return resourceEntries.has(normalizeResourceKey(filePath));
}

export function computeFilesNeedingDownload(
  manifest: ResourceManifest,
  cachedManifest?: ResourceManifest | null,
  cachedOutputPaths: readonly string[] = [],
): ResourceManifestEntry[] {
  const cachedByPath = new Map((cachedManifest?.files ?? []).map((file) => [normalizeResourceKey(file.path), file]));
  const cachedOutputs = new Set(cachedOutputPaths);

  return manifest.files.filter((file) => {
    const previous = cachedByPath.get(normalizeResourceKey(file.path));
    if (!previous) {
      return true;
    }
    if (previous.hash !== file.hash || previous.outputPath !== file.outputPath) {
      return true;
    }
    return !cachedOutputs.has(file.outputPath);
  });
}

function applyManifest(manifest: ResourceManifest): void {
  resourceEntries.clear();
  for (const file of manifest.files) {
    resourceEntries.set(normalizeResourceKey(file.path), file);
  }
}

async function loadRemoteManifest(): Promise<ResourceManifest> {
  const response = await fetch(resourcePublicUrl(RESOURCE_MANIFEST_URL), { cache: "no-cache" });
  if (!response.ok) {
    throw new Error(`Failed to fetch resource manifest: ${response.status}`);
  }
  return response.json() as Promise<ResourceManifest>;
}

async function readCachedManifest(cache: Cache): Promise<ResourceManifest | null> {
  const response = await cache.match(resourcePublicUrl(RESOURCE_MANIFEST_URL), { ignoreVary: true });
  if (!response) {
    return null;
  }
  try {
    return await response.json() as ResourceManifest;
  } catch {
    return null;
  }
}

async function collectFilesToDownload(
  cache: Cache,
  manifest: ResourceManifest,
  cachedManifest?: ResourceManifest | null,
): Promise<ResourceManifestEntry[]> {
  const cachedOutputPaths = [];

  for (const file of manifest.files) {
    const cached = await cache.match(resourcePublicUrl(file.outputPath), { ignoreVary: true });
    if (cached) {
      cachedOutputPaths.push(file.outputPath);
    }
  }

  return computeFilesNeedingDownload(manifest, cachedManifest, cachedOutputPaths);
}

async function isManifestCachedComplete(cache: Cache, manifest: ResourceManifest): Promise<boolean> {
  for (const file of manifest.files) {
    const cached = await cache.match(resourcePublicUrl(file.outputPath), { ignoreVary: true });
    if (!cached) {
      return false;
    }
  }
  return true;
}

async function cacheManifest(cache: Cache, manifest: ResourceManifest): Promise<void> {
  await cache.put(
    resourcePublicUrl(RESOURCE_MANIFEST_URL),
    new Response(JSON.stringify(manifest), {
      headers: { "content-type": "application/json" },
    }),
  );
}

async function deleteStaleEntries(cache: Cache, manifest: ResourceManifest): Promise<void> {
  const liveOutputPaths = new Set(manifest.files.map((file) => resourcePublicUrl(file.outputPath)));
  const liveOutputPathnames = new Set(manifest.files.map((file) => new URL(resourcePublicUrl(file.outputPath), window.location.href).pathname));
  const keys = await cache.keys();

  await Promise.all(keys.map(async (request) => {
    if (request.url === resourcePublicUrl(RESOURCE_MANIFEST_URL)) {
      return;
    }

    const requestUrl = new URL(request.url);
    if (!requestUrl.pathname.includes("/resource-assets/")) {
      return;
    }

    if (!liveOutputPaths.has(request.url) && !liveOutputPathnames.has(requestUrl.pathname)) {
      await cache.delete(request);
    }
  }));
}

async function readResponseWithProgress(
  response: Response,
  onChunk: (chunkBytes: number) => void,
): Promise<Response> {
  if (!response.body) {
    const blob = await response.blob();
    onChunk(blob.size);
    return new Response(blob, {
      headers: {
        "content-type": response.headers.get("content-type") ?? "application/octet-stream",
      },
    });
  }

  const reader = response.body.getReader();
  const chunks: ArrayBuffer[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    chunks.push(value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength));
    onChunk(value.byteLength);
  }

  return new Response(new Blob(chunks), {
    headers: {
      "content-type": response.headers.get("content-type") ?? "application/octet-stream",
    },
  });
}

async function ensureResourceServiceWorker(): Promise<boolean> {
  if (!("serviceWorker" in navigator)) {
    return false;
  }

  try {
    await navigator.serviceWorker.register(resourcePublicUrl(RESOURCE_SERVICE_WORKER_URL), {
      scope: baseUrlForPublicAssets(),
    });
    await navigator.serviceWorker.ready;
    if (navigator.serviceWorker.controller) {
      return true;
    }

    await new Promise<void>((resolve) => {
      const timer = window.setTimeout(() => {
        navigator.serviceWorker.removeEventListener("controllerchange", handleChange);
        resolve();
      }, 2000);

      const handleChange = (): void => {
        window.clearTimeout(timer);
        navigator.serviceWorker.removeEventListener("controllerchange", handleChange);
        resolve();
      };

      navigator.serviceWorker.addEventListener("controllerchange", handleChange);
    });

    return Boolean(navigator.serviceWorker.controller);
  } catch (error) {
    console.warn("Resource service worker unavailable:", error);
    return false;
  }
}

function normalizeResourceKey(filePath: string): string {
  return filePath.replace(/^\/+/, "").replace(/\\/g, "/");
}

function resourcePublicUrl(filePath: string): string {
  const base = baseUrlForPublicAssets();
  const normalizedPath = filePath.replace(/^\/+/, "");

  if (base === "" || base.endsWith("/")) {
    return `${base}${normalizedPath}`;
  }

  return `${base}/${normalizedPath}`;
}

function baseUrlForPublicAssets(): string {
  const base = (import.meta as ImportMeta & {
    readonly env: { readonly BASE_URL: string };
  }).env.BASE_URL;

  return base.length > 0 ? base : "/";
}
