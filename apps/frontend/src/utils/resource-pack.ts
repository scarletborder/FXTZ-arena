import Phaser from "phaser";

const RESOURCE_PACK_KEY = "resource-pack";
const RESOURCE_PACK_CACHE_NAME = "fxtz-resource-pack-v1";
const MAGIC = "FXTZRES1\n";

type ResourceEntry = {
  readonly key: string;
  readonly mime: string;
  readonly offset: number;
  readonly length: number;
};

type ResourceManifest = {
  readonly version: number;
  readonly files: readonly ResourceEntry[];
};

const resourceUrls = new Map<string, string>();
let preparedResourcePackUrl: string | undefined;

export type ResourcePackPrepareStage = "checking" | "ready" | "downloading" | "fallback" | "error";

export interface ResourcePackPrepareProgress {
  readonly stage: ResourcePackPrepareStage;
  readonly downloadedBytes?: number;
  readonly totalBytes?: number;
}

export type ResourcePackPrepareProgressHandler = (progress: ResourcePackPrepareProgress) => void;

export async function prepareResourcePackSource(onProgress?: ResourcePackPrepareProgressHandler): Promise<void> {
  onProgress?.({ stage: "checking" });

  if (isDesktopTarget()) {
    preparedResourcePackUrl = assetUrlWithoutPack("resources.dat");
    onProgress?.({ stage: "ready" });
    return;
  }

  const datUrl = assetUrlWithoutPack("resources.dat");
  const sigUrl = assetUrlWithoutPack("resources.dat.sig");
  if (!("caches" in window)) {
    preparedResourcePackUrl = datUrl;
    onProgress?.({ stage: "ready" });
    return;
  }

  const cache = await caches.open(RESOURCE_PACK_CACHE_NAME);
  const remoteSignature = await fetchText(sigUrl, "no-cache");
  const cachedSignature = await cache.match(sigUrl).then((response) => response?.text());
  const cachedPack = await cache.match(datUrl);

  if (cachedPack && remoteSignature && cachedSignature?.trim() === remoteSignature.trim()) {
    preparedResourcePackUrl = URL.createObjectURL(await cachedPack.blob());
    onProgress?.({ stage: "ready" });
    return;
  }

  const response = await fetch(datUrl, { cache: "no-cache" });
  if (!response.ok) {
    if (cachedPack) {
      preparedResourcePackUrl = URL.createObjectURL(await cachedPack.blob());
      onProgress?.({ stage: "fallback" });
      return;
    }
    onProgress?.({ stage: "error" });
    throw new Error(`Failed to fetch resources.dat: ${response.status}`);
  }

  const packBlob = await readResponseBlobWithProgress(response, onProgress);
  await cache.put(datUrl, new Response(packBlob, { headers: { "content-type": "application/octet-stream" } }));
  if (remoteSignature) {
    await cache.put(sigUrl, new Response(remoteSignature, { headers: { "content-type": "text/plain" } }));
  }
  preparedResourcePackUrl = URL.createObjectURL(packBlob);
  onProgress?.({ stage: "ready", downloadedBytes: packBlob.size, totalBytes: packBlob.size });
}

export function queueResourcePack(scene: Phaser.Scene): void {
  if (!scene.cache.binary.exists(RESOURCE_PACK_KEY)) {
    scene.load.binary(RESOURCE_PACK_KEY, preparedResourcePackUrl ?? assetUrlWithoutPack("resources.dat"));
  }
}

export function installResourcePackFromCache(scene: Phaser.Scene): void {
  const cached = scene.cache.binary.get(RESOURCE_PACK_KEY) as ArrayBuffer | Uint8Array | undefined;
  if (!cached || resourceUrls.size > 0) {
    return;
  }
  const pack = cached instanceof Uint8Array
    ? new Uint8Array(cached).buffer
    : cached;

  const view = new DataView(pack);
  const header = new TextDecoder().decode(pack.slice(0, MAGIC.length));
  if (header !== MAGIC) {
    throw new Error("Invalid resources.dat header.");
  }

  const manifestLength = view.getUint32(MAGIC.length, true);
  const manifestStart = MAGIC.length + 4;
  const manifestEnd = manifestStart + manifestLength;
  const manifest = JSON.parse(new TextDecoder().decode(pack.slice(manifestStart, manifestEnd))) as ResourceManifest;

  for (const file of manifest.files) {
    const start = manifestEnd + file.offset;
    const bytes = new Uint8Array(pack, start, file.length);
    const blob = new Blob([bytes], { type: file.mime });
    resourceUrls.set(normalizeResourceKey(file.key), URL.createObjectURL(blob));
  }
}

export function resourceAssetUrl(path: string): string | undefined {
  const key = normalizeResourceKey(path);
  return resourceUrls.get(key) ?? resourceUrls.get(stripAssetsPrefix(key));
}

export function hasResourceAsset(path: string): boolean {
  const key = normalizeResourceKey(path);
  return resourceUrls.has(key) || resourceUrls.has(stripAssetsPrefix(key));
}

function normalizeResourceKey(path: string): string {
  return path.replace(/^\/+/, "").replace(/\\/g, "/");
}

function stripAssetsPrefix(path: string): string {
  return path.startsWith("assets/") ? path.slice("assets/".length) : path;
}

function assetUrlWithoutPack(path: string): string {
  const base = (import.meta as ImportMeta & {
    readonly env: { readonly BASE_URL: string };
  }).env.BASE_URL;
  const normalizedPath = path.replace(/^\/+/, "");

  if (base === "" || base.endsWith("/")) {
    return `${base}${normalizedPath}`;
  }

  return `${base}/${normalizedPath}`;
}

async function fetchText(url: string, cache: RequestCache): Promise<string | undefined> {
  const response = await fetch(url, { cache });
  if (!response.ok) {
    return undefined;
  }
  return response.text();
}

async function readResponseBlobWithProgress(
  response: Response,
  onProgress?: ResourcePackPrepareProgressHandler,
): Promise<Blob> {
  const totalBytes = Number(response.headers.get("content-length")) || undefined;
  if (!response.body) {
    const blob = await response.blob();
    onProgress?.({ stage: "downloading", downloadedBytes: blob.size, totalBytes: blob.size });
    return blob;
  }

  const reader = response.body.getReader();
  const chunks: ArrayBuffer[] = [];
  let downloadedBytes = 0;
  onProgress?.({ stage: "downloading", downloadedBytes, totalBytes });

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    chunks.push(value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength));
    downloadedBytes += value.byteLength;
    onProgress?.({ stage: "downloading", downloadedBytes, totalBytes });
  }

  return new Blob(chunks, {
    type: response.headers.get("content-type") ?? "application/octet-stream",
  });
}

function isDesktopTarget(): boolean {
  return (import.meta as ImportMeta & {
    readonly env: { readonly VITE_APP_TARGET?: string };
  }).env.VITE_APP_TARGET === "desktop";
}
