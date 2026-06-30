import { IS_DESKTOP_APP } from "@repo/constants";

export interface DesktopUpdateProgress {
  readonly downloadedBytes?: number;
  readonly totalBytes?: number;
}

interface ProcessApi {
  relaunch(): Promise<void>;
}

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

  const unlisten = await event.listen<DesktopUpdateProgress>("desktop-update-progress", (event) => {
    onProgress?.(event.payload);
  });

  try {
    const updated = await invoke<boolean>("desktop_update_and_install_if_available");
    if (!updated) {
      return false;
    }
    await relaunch();
    return true;
  } finally {
    unlisten();
  }
}

function isDesktopUpdaterConfigured(): boolean {
  const env = (import.meta as ImportMeta & {
    readonly env: { readonly VITE_DESKTOP_UPDATER_ENDPOINT?: string };
  }).env;

  return typeof env.VITE_DESKTOP_UPDATER_ENDPOINT === "string" && env.VITE_DESKTOP_UPDATER_ENDPOINT.length > 0;
}
