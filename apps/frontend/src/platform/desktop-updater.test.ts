import { describe, expect, it } from "vitest";

import { updateDesktopAppIfNeededWithDeps } from "./desktop-updater";

describe("updateDesktopAppIfNeededWithDeps", () => {
  it("continues startup when the desktop updater command does not settle", async () => {
    let unlistened = false;

    const updated = await updateDesktopAppIfNeededWithDeps(
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

    expect(updated).toBe(false);
    expect(unlistened).toBe(true);
  });
});
