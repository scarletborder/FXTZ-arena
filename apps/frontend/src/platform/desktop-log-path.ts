import { IS_DESKTOP_APP } from "@repo/constants";

interface TauriCoreApi {
  invoke<T>(command: string, args?: Record<string, unknown>): Promise<T>;
}

/**
 * Opens a native folder selection dialog for choosing the log storage directory.
 * Returns the selected directory path, or null if cancelled.
 * On non-desktop platforms, returns null.
 */
export async function selectLogDirectory(): Promise<string | null> {
  if (!IS_DESKTOP_APP) {
    return null;
  }
  try {
    const core = await import("@tauri-apps/api/core") as TauriCoreApi;
    return core.invoke<string | null>("select_log_directory");
  } catch {
    return null;
  }
}
