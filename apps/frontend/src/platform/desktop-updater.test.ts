import { describe, expect, it, vi } from "vitest";

import { readLatestVersion, updateDesktopAppIfNeededWithDeps } from "./desktop-updater";

describe("readLatestVersion", () => {
  it("reads the Tauri updater manifest version", () => {
    expect(readLatestVersion({ version: "0.6.4", platforms: {} })).toBe("0.6.4");
  });

  it("rejects missing or invalid versions", () => {
    expect(readLatestVersion({ platforms: {} })).toBeNull();
    expect(readLatestVersion({ version: 604 })).toBeNull();
  });
});

describe("updateDesktopAppIfNeededWithDeps", () => {
  it("continues startup when the desktop updater command does not settle", async () => {
    let unlistened = false;

    const result = await updateDesktopAppIfNeededWithDeps(
      {
        invoke: <T>() => new Promise<T>(() => {}),
        listen: async () => {
          return () => {
            unlistened = true;
          };
        },
        relaunch: async () => {
          throw new Error("relaunch should not be called after updater timeout");
        },
      },
      undefined,
      1,
    );

    expect(result).toEqual({ status: "failed", reason: "timeout" });
    expect(unlistened).toBe(true);
  });

  it("reports a failed version check when the updater command rejects", async () => {
    let unlistened = false;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    try {
      const result = await updateDesktopAppIfNeededWithDeps({
        invoke: async () => {
          throw new Error("manifest unavailable");
        },
        listen: async () => {
          return () => {
            unlistened = true;
          };
        },
        relaunch: async () => {
          throw new Error("relaunch should not be called after updater failure");
        },
      });

      expect(result).toEqual({ status: "failed", reason: "error" });
      expect(unlistened).toBe(true);
    } finally {
      warn.mockRestore();
    }
  });

  it("keeps the no-update path distinct from update check failures", async () => {
    const result = await updateDesktopAppIfNeededWithDeps({
      invoke: async <T>() => false as T,
      listen: async () => () => {},
      relaunch: async () => {
        throw new Error("relaunch should not be called when no update is available");
      },
    });

    expect(result).toEqual({ status: "not-available" });
  });
});
