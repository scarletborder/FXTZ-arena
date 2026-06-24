import { IS_DESKTOP_APP } from "@repo/constants";
import { settingsRepository } from "../store/settings";

type LogLevel = "INFO" | "WARN" | "ERROR" | "DEBUG";

interface TauriCoreApi {
  invoke<T>(command: string, args?: Record<string, unknown>): Promise<T>;
}

const formatLogValue = (value: unknown): string => {
  if (value instanceof Error) {
    return value.stack || value.message;
  }
  if (typeof value === "string") {
    return value;
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
};

const getLogPath = (): string => {
  const dir = settingsRepository.get().logPath || "D:/";
  return `${dir.replace(/\\+$/, "").replace(/\/+$/, "")}/arena.log`;
};

const appendLogLine = async (line: string): Promise<void> => {
  try {
    const core = await import("@tauri-apps/api/core") as TauriCoreApi;
    await core.invoke("append_client_log", { line, path: getLogPath() });
  } catch {
    // Ignore log write errors to keep the app running.
  }
};

export const installDesktopConsoleLogger = (): void => {
  if (!IS_DESKTOP_APP) {
    return;
  }
  const globalState = globalThis as typeof globalThis & { __fxtzConsoleLoggerInstalled?: boolean };
  if (globalState.__fxtzConsoleLoggerInstalled) {
    return;
  }
  globalState.__fxtzConsoleLoggerInstalled = true;

  const original = {
    log: console.log,
    info: console.info,
    warn: console.warn,
    error: console.error,
    debug: console.debug,
  };

  const write = (level: LogLevel, args: unknown[]): void => {
    if (!settingsRepository.get().debug) {
      // Only write to file when debug mode is enabled.
      return;
    }
    const timestamp = new Date().toISOString();
    const body = args.map(formatLogValue).join(" ");
    void appendLogLine(`${timestamp} [${level}] ${body}\n`);
  };

  console.log = (...args: unknown[]) => {
    original.log(...args);
    write("INFO", args);
  };
  console.info = (...args: unknown[]) => {
    original.info(...args);
    write("INFO", args);
  };
  console.warn = (...args: unknown[]) => {
    original.warn(...args);
    write("WARN", args);
  };
  console.error = (...args: unknown[]) => {
    original.error(...args);
    write("ERROR", args);
  };
  console.debug = (...args: unknown[]) => {
    original.debug(...args);
    write("DEBUG", args);
  };

  window.addEventListener("error", (event) => {
    write("ERROR", ["window.error", event.error ?? event.message]);
  });
  window.addEventListener("unhandledrejection", (event) => {
    write("ERROR", ["unhandledrejection", event.reason]);
  });
};
