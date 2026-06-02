import { IS_DESKTOP_APP } from "@repo/constants";

interface TauriCoreApi {
  invoke<T>(command: string, args?: Record<string, unknown>): Promise<T>;
}

export async function saveDesktopDebugLog(filename: string, text: string): Promise<string | null> {
  if (!IS_DESKTOP_APP) {
    return null;
  }

  const core = await import("@tauri-apps/api/core") as TauriCoreApi;
  return core.invoke<string | null>("save_debug_log", { filename, text });
}
