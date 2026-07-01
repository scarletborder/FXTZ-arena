import { IS_DESKTOP_APP } from "@repo/constants";

export interface DesktopUpdateProgress {
  readonly downloadedBytes?: number;
  readonly totalBytes?: number;
}

interface ProcessApi {
  relaunch(): Promise<void>;
}

interface DesktopUpdaterDeps {
  readonly invoke: <T>(command: string, args?: Record<string, unknown>) => Promise<T>;
  readonly listen: <T>(event: string, handler: (event: { payload: T }) => void) => Promise<() => void>;
  readonly relaunch: () => Promise<void>;
}

const DESKTOP_UPDATE_TIMEOUT_MS = 8_000;

export async function updateDesktopAppIfNeeded(
  onProgress?: (progress: DesktopUpdateProgress) => void,
): Promise<boolean> {
  if (!IS_DESKTOP_APP || !isDesktopUpdaterConfigured()) {
    return false;
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
): Promise<boolean> {
  const unlisten = await deps.listen<DesktopUpdateProgress>("desktop-update-progress", (event) => {
    onProgress?.(event.payload);
  });

  try {
    const updated = await withTimeout(
      deps.invoke<boolean>("desktop_update_and_install_if_available"),
      timeoutMs,
      false,
    );
    if (!updated) {
      return false;
    }
    await deps.relaunch();
    return true;
  } finally {
    unlisten();
  }
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, fallback: T): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((resolve) => {
        timeout = setTimeout(() => resolve(fallback), timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
}

function isDesktopUpdaterConfigured(): boolean {
  const env = (import.meta as ImportMeta & {
    readonly env: { readonly VITE_DESKTOP_UPDATER_ENDPOINT?: string };
  }).env;

  return typeof env.VITE_DESKTOP_UPDATER_ENDPOINT === "string" && env.VITE_DESKTOP_UPDATER_ENDPOINT.length > 0;
}
