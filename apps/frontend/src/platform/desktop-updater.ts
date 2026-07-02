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
  | { readonly status: "not-available" }
  | { readonly status: "not-configured" }
  | { readonly status: "failed" };

interface ProcessApi {
  relaunch(): Promise<void>;
}

interface DesktopRemoteUpdatePayload {
  readonly version: string;
}

interface DesktopUpdaterDeps {
  readonly invoke: <T>(command: string, args?: Record<string, unknown>) => Promise<T>;
  readonly listen: <T>(event: string, handler: (event: { payload: T }) => void) => Promise<() => void>;
  readonly relaunch: () => Promise<void>;
}

const DESKTOP_UPDATE_TIMEOUT_MS = 20_000;

export async function fetchDesktopRemoteVersion(timeoutMs = DESKTOP_UPDATE_TIMEOUT_MS): Promise<DesktopRemoteVersionResult> {
  if (!IS_DESKTOP_APP) {
    return { status: "not-configured" };
  }

  try {
    const { invoke } = await import("@tauri-apps/api/core") as {
      invoke<T>(command: string, args?: Record<string, unknown>): Promise<T>;
    };
    const update = await withTimeout(
      invoke<DesktopRemoteUpdatePayload | null>("desktop_remote_update_version"),
      timeoutMs,
      UPDATE_TIMEOUT,
    );
    if (update === UPDATE_TIMEOUT) {
      return { status: "failed" };
    }

    return update ? { status: "available", version: update.version } : { status: "not-available" };
  } catch (error) {
    console.warn("Desktop remote update version check failed:", error);
    return { status: "failed" };
  }
}

export async function updateDesktopAppIfNeeded(
  onProgress?: (progress: DesktopUpdateProgress) => void,
): Promise<DesktopUpdateResult> {
  if (!IS_DESKTOP_APP) {
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
