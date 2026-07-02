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
let desktopBaseUrl: string | undefined = undefined;

export type ResourcePackPrepareStage = "checking" | "ready" | "downloading" | "fallback" | "error";

export interface ResourcePackPrepareProgress {
  readonly stage: ResourcePackPrepareStage;
  readonly downloadedBytes?: number;
  readonly totalBytes?: number;
}

export type ResourcePackPrepareProgressHandler = (progress: ResourcePackPrepareProgress) => void;

export async function prepareResourcePackSource(onProgress?: ResourcePackPrepareProgressHandler): Promise<void> {
  console.log("[ResourcePack] >>> 进入资源准备函数 prepareResourcePackSource...");
  onProgress?.({ stage: "checking" });

  // ==========================================================
  // 💡 桌面端 Tauri 物理路径检测与非跨域原生下载逻辑
  // ==========================================================
  if (IS_DESKTOP_APP) {
    console.log("[ResourcePack] 检测到当前运行在【桌面端 (Tauri)】环境，开始执行本地资源初始化...");

    // ==========================================================
    // 💡 新增：强制注销桌面端下冲突残留的 Service Worker (避免 localhost 开发缓存干扰)
    // ==========================================================
    if ("serviceWorker" in navigator) {
      try {
        const registrations = await navigator.serviceWorker.getRegistrations();
        for (const registration of registrations) {
          await registration.unregister();
          console.log("[Tauri] 🛠️ 已强制注销冲突残留的 Service Worker:", registration.scope);
        }
      } catch (swErr) {
        console.warn("[Tauri] 注销 Service Worker 时发生非致命警告:", swErr);
      }
    }

    try {
      console.log("[ResourcePack] 正在动态加载 Tauri v2 原生依赖...");
      const [fs, path, core, http] = await Promise.all([
        import("@tauri-apps/plugin-fs").catch(e => {
          console.error("[ResourcePack] ❌ 导入 @tauri-apps/plugin-fs 失败！请检查 Rust 端是否注册了 tauri_plugin_fs", e);
          throw e;
        }),
        import("@tauri-apps/api/path").catch(e => {
          console.error("[ResourcePack] ❌ 导入 @tauri-apps/api/path 失败！", e);
          throw e;
        }),
        import("@tauri-apps/api/core").catch(e => {
          console.error("[ResourcePack] ❌ 导入 @tauri-apps/api/core 失败！", e);
          throw e;
        }),
        import("@tauri-apps/plugin-http").catch(e => {
          console.error("[ResourcePack] ❌ 导入 @tauri-apps/plugin-http 失败！请确保在当前 workspace 下运行了 pnpm tauri add http", e);
          throw e;
        })
      ]);
      console.log("[ResourcePack] ✅ Tauri 依赖库加载成功。");

      const { BaseDirectory, exists, readTextFile, writeTextFile, mkdir, writeFile } = fs;
      const { appLocalDataDir, join } = path;
      const { convertFileSrc } = core;
      // 💡 在桌面端使用原生 HTTP 客户端，绕过所有 CORS 限制
      const desktopFetch = http.fetch;

      const localDataDir = await appLocalDataDir();
      console.log("[ResourcePack] 获取到本地 AppData 目录:", localDataDir);

      const localAssetsPath = await join(localDataDir, "game_assets");
      console.log("[ResourcePack] 游戏资源物理路径映射为:", localAssetsPath);

      desktopBaseUrl = convertFileSrc(localAssetsPath);
      console.log("[ResourcePack] 转换为 WebView 资源安全协议 URL (baseURL):", desktopBaseUrl);

      const manifestPath = "game_assets/resource-manifest.json";
      console.log("[ResourcePack] 正在检查本地 AppData 下是否存在清单文件:", manifestPath);
      const hasLocalManifest = await exists(manifestPath, { baseDir: BaseDirectory.AppLocalData });
      console.log("[ResourcePack] 本地清单是否存在:", hasLocalManifest);

      let cachedManifest: ResourceManifest | null = null;
      if (hasLocalManifest) {
        try {
          console.log("[ResourcePack] 开始读取本地清单文件内容...");
          const manifestStr = await readTextFile(manifestPath, { baseDir: BaseDirectory.AppLocalData });
          cachedManifest = JSON.parse(manifestStr) as ResourceManifest;
          console.log("[ResourcePack] ✅ 本地清单解析成功，版本号:", cachedManifest.version);
        } catch (e) {
          console.warn("[ResourcePack] ⚠️ 本地清单读取或解析失败，将丢弃并尝试重新生成:", e);
        }
      }

      const remoteUrl = resourcePublicUrl(RESOURCE_MANIFEST_URL);
      console.log("[ResourcePack] 准备从 CDN 获取远端清单:", remoteUrl);
      let remoteManifest: ResourceManifest;
      try {
        remoteManifest = await loadRemoteManifest(desktopFetch); // 💡 传递原生抓取方法
        console.log("[ResourcePack] ✅ 远端清单获取成功，版本号:", remoteManifest.version);
      } catch (error) {
        console.warn("[ResourcePack] ⚠️ 远端清单下载失败（可能是离线状态）：", error);
        if (cachedManifest) {
          console.log("[ResourcePack] 📡 [离线模式启动]：本地存在历史资源清单，直接应用进入 fallback 状态。");
          applyManifest(cachedManifest);
          onProgress?.({ stage: "fallback" });
          return;
        }
        console.error("[ResourcePack] ❌ 远端清单获取失败，且本地无历史备份，无法进入游戏。");
        onProgress?.({ stage: "error" });
        throw error;
      }

      console.log("[ResourcePack] 开始对比远端清单与本地实际物理文件哈希...");
      const downloads: ResourceManifestEntry[] = [];
      for (const file of remoteManifest.files) {
        const fileLocalPath = `game_assets/${file.outputPath}`;
        const fileExists = await exists(fileLocalPath, { baseDir: BaseDirectory.AppLocalData });

        let needsDownload = !fileExists;
        if (fileExists && cachedManifest) {
          const previous = cachedManifest.files.find(
            (f) => normalizeResourceKey(f.path) === normalizeResourceKey(file.path)
          );
          if (!previous || previous.hash !== file.hash || previous.outputPath !== file.outputPath) {
            needsDownload = true;
          }
        }

        if (needsDownload) {
          downloads.push(file);
        }
      }

      const totalBytes = downloads.reduce((sum, file) => sum + file.size, 0);
      let downloadedBytes = 0;

      console.log(`[ResourcePack] 对比完成：本地需要下载/更新的文件共 ${downloads.length} 个，总大小: ${formatBytes(totalBytes)}`);

      if (downloads.length > 0) {
        onProgress?.({ stage: "downloading", downloadedBytes, totalBytes });
      }

      // 开始下载资源到本地沙盒目录
      for (const file of downloads) {
        const fileUrl = resourcePublicUrl(file.outputPath);
        console.log(`[ResourcePack] 正在从网络下载资源 [${file.path}] -> ${fileUrl}`);

        // 💡 使用 desktopFetch 原生请求，绕过重定向 CORS 拦截
        const response = await desktopFetch(fileUrl, { cache: "no-cache" });
        if (!response.ok) {
          throw new Error(`Failed to fetch file from CDN [${file.outputPath}], HTTP Status: ${response.status}`);
        }

        // 递归创建父级文件夹
        const parts = file.outputPath.split("/");
        if (parts.length > 1) {
          const parentFolder = parts.slice(0, -1).join("/");
          const targetDir = await join("game_assets", parentFolder);
          await mkdir(targetDir, { recursive: true, baseDir: BaseDirectory.AppLocalData });
        }

        const arrayBuffer = await response.arrayBuffer();
        const data = new Uint8Array(arrayBuffer);

        const targetFilePath = `game_assets/${file.outputPath}`;
        console.log(`[ResourcePack] 写入物理文件至 AppLocalData: ${targetFilePath} (${data.length} 字节)`);
        await writeFile(targetFilePath, data, { baseDir: BaseDirectory.AppLocalData });

        downloadedBytes += file.size;
        onProgress?.({ stage: "downloading", downloadedBytes, totalBytes });
      }

      console.log("[ResourcePack] 所有待更新资源下载及写入物理磁盘完毕，正在更新本地清单文件...");
      await mkdir("game_assets", { recursive: true, baseDir: BaseDirectory.AppLocalData });
      await writeTextFile(manifestPath, JSON.stringify(remoteManifest, null, 2), { baseDir: BaseDirectory.AppLocalData });

      console.log("[ResourcePack] 正在将清单同步至游戏内存缓存中...");
      applyManifest(remoteManifest);
      onProgress?.({ stage: "ready", downloadedBytes, totalBytes });
      console.log("[ResourcePack] 🎉 桌面端资源初始化过程完美结束！");
      return;

    } catch (err) {
      console.error("[ResourcePack] 🛑 CRITICAL ERROR inside desktop prepareResourcePackSource:", err);
      onProgress?.({ stage: "error" });
      throw err;
    }
  }

  // ==========================================================
  // 🌐 原有浏览器 (网页端) 缓存和 Service Worker 逻辑
  // ==========================================================
  console.log("[ResourcePack] 检测到运行在【网页端 (Browser)】环境，使用原生 Cache API 进行管理...");
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
}

export function installResourcePackFromCache(scene: Phaser.Scene): void {
  void scene;
}

export function resourceAssetUrl(filePath: string): string | undefined {
  const entry = resourceEntries.get(normalizeResourceKey(filePath));
  if (!entry) {
    return undefined;
  }

  if (IS_DESKTOP_APP && desktopBaseUrl) {
    const cleanBase = desktopBaseUrl.endsWith("/") ? desktopBaseUrl : `${desktopBaseUrl}/`;
    const cleanPath = entry.outputPath.replace(/^\/+/, "");
    return `${cleanBase}${cleanPath}`;
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

// 💡 支持传递桌面端原生 fetch 方法进行代理
async function loadRemoteManifest(desktopFetch?: any): Promise<ResourceManifest> {
  const activeFetch = (IS_DESKTOP_APP && desktopFetch) ? desktopFetch : fetch;
  const response = await activeFetch(resourcePublicUrl(RESOURCE_MANIFEST_URL), { cache: "no-cache" });
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
  const normalizedPath = filePath.replace(/^\/+/, "");

  if (IS_DESKTOP_APP) {
    const cdnBase = (import.meta as ImportMeta & {
      readonly env: { readonly VITE_CDN_URL?: string };
    }).env.VITE_CDN_URL || "https://scarletborder.github.io/FXTZ-arena/";

    const cleanBase = cdnBase.endsWith("/") ? cdnBase : `${cdnBase}/`;
    return `${cleanBase}${normalizedPath}`;
  }

  const base = baseUrlForPublicAssets();
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

function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(value >= 10 ? 1 : 2)} ${units[unitIndex]}`;
}