import { IS_DESKTOP_APP } from "@repo/constants";

export interface DesktopUpdateProgress {
  readonly downloadedBytes?: number;
  readonly totalBytes?: number;
}

export type DesktopUpdateResult =
  | { readonly status: "updated" }
  | { readonly status: "not-available" }
  | { readonly status: "failed"; readonly reason: "timeout" | "error" };

export type DesktopRemoteVersionResult =
  | { readonly status: "available"; readonly version: string }
  | { readonly status: "not-configured" }
  | { readonly status: "failed" };

interface ProcessApi {
  relaunch(): Promise<void>;
}

interface DesktopUpdaterDeps {
  readonly invoke: <T>(command: string, args?: Record<string, unknown>) => Promise<T>;
  readonly listen: <T>(event: string, handler: (event: { payload: T }) => void) => Promise<() => void>;
  readonly relaunch: () => Promise<void>;
}

const DESKTOP_UPDATE_TIMEOUT_MS = 8_000;

export async function fetchDesktopRemoteVersion(timeoutMs = DESKTOP_UPDATE_TIMEOUT_MS): Promise<DesktopRemoteVersionResult> {
  const endpoint = getDesktopUpdaterEndpoint();
  if (!endpoint) {
    return { status: "not-configured" };
  }

  try {
    const response = await withTimeout(fetch(endpoint, { cache: "no-store" }), timeoutMs, UPDATE_TIMEOUT);
    if (response === UPDATE_TIMEOUT || !response.ok) {
      return { status: "failed" };
    }

    const payload = await response.json() as unknown;
    const version = readLatestVersion(payload);
    return version ? { status: "available", version } : { status: "failed" };
  } catch (error) {
    console.warn("Desktop remote version fetch failed:", error);
    return { status: "failed" };
  }
}

export async function updateDesktopAppIfNeeded(
  onProgress?: (progress: DesktopUpdateProgress) => void,
): Promise<DesktopUpdateResult> {
  if (!IS_DESKTOP_APP || !getDesktopUpdaterEndpoint()) {
    return { status: "not-available" };
  }

  const [{ invoke }, event, { relaunch }] = await Promise.all([
    import("@tauri-apps/api/core") as Promise<{ invoke<T>(command: string, args?: Record<string, unknown>): Promise<T> }>,
    import("@tauri-apps/api/event") as Promise<{ listen<T>(event: string, handler: (event: { payload: T }) => void): Promise<() => void> }>,
    import("@tauri-apps/plugin-process") as Promise<ProcessApi>,
  ]);

  return updateDesktopAppIfNeededWithDeps({ invoke, listen: event.listen, relaunch }, onProgress);
}

export async function updateDesktopAppIfNeededWithDeps(
  deps: DesktopUpdaterDeps,
  onProgress?: (progress: DesktopUpdateProgress) => void,
  timeoutMs = DESKTOP_UPDATE_TIMEOUT_MS,
): Promise<DesktopUpdateResult> {
  const unlisten = await deps.listen<DesktopUpdateProgress>("desktop-update-progress", (event) => {
    onProgress?.(event.payload);
  });

  try {
    const updated = await withTimeout(
      deps.invoke<boolean>("desktop_update_and_install_if_available"),
      timeoutMs,
      UPDATE_TIMEOUT,
    );
    if (updated === UPDATE_TIMEOUT) {
      return { status: "failed", reason: "timeout" };
    }
    if (!updated) {
      return { status: "not-available" };
    }
    await deps.relaunch();
    return { status: "updated" };
  } catch (error) {
    console.warn("Desktop update check failed:", error);
    return { status: "failed", reason: "error" };
  } finally {
    unlisten();
  }
}

const UPDATE_TIMEOUT = Symbol("desktop-update-timeout");

async function withTimeout<T, F>(promise: Promise<T>, timeoutMs: number, fallback: F): Promise<T | F> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<F>((resolve) => {
        timeout = setTimeout(() => resolve(fallback), timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
}

export function readLatestVersion(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const version = (payload as { readonly version?: unknown }).version;
  return typeof version === "string" && version.length > 0 ? version : null;
}

function getDesktopUpdaterEndpoint(): string | null {
  const env = (import.meta as ImportMeta & {
    readonly env: { readonly VITE_DESKTOP_UPDATER_ENDPOINT?: string };
  }).env;

  return typeof env.VITE_DESKTOP_UPDATER_ENDPOINT === "string" && env.VITE_DESKTOP_UPDATER_ENDPOINT.length > 0
    ? env.VITE_DESKTOP_UPDATER_ENDPOINT
    : null;
}
