import { describe, expect, it } from "vitest";

import { computeFilesNeedingDownload, type ResourceManifestEntry } from "./resource-pack";

function file(overrides: Partial<ResourceManifestEntry> & Pick<ResourceManifestEntry, "path" | "outputPath">): ResourceManifestEntry {
  return {
    hash: "hash-a",
    mime: "image/png",
    size: 10,
    ...overrides,
  };
}

describe("computeFilesNeedingDownload", () => {
  it("downloads files missing from cache", () => {
    const manifest = {
      version: 2,
      files: [
        file({ path: "assets/a.png", outputPath: "resource-assets/a.png" }),
        file({ path: "assets/b.png", outputPath: "resource-assets/b.png" }),
      ],
    };

    expect(computeFilesNeedingDownload(manifest, null, ["resource-assets/a.png"])).toEqual([
      manifest.files[0],
      manifest.files[1],
    ]);
  });

  it("skips unchanged cached files", () => {
    const same = file({ path: "assets/a.png", outputPath: "resource-assets/a.png" });
    const manifest = { version: 2, files: [same] };
    const cached = { version: 2, files: [same] };

    expect(computeFilesNeedingDownload(manifest, cached, ["resource-assets/a.png"])).toEqual([]);
  });

  it("redownloads files whose hash changed", () => {
    const current = file({ path: "assets/a.png", outputPath: "resource-assets/a.png", hash: "new-hash" });
    const cached = file({ path: "assets/a.png", outputPath: "resource-assets/a.png", hash: "old-hash" });

    expect(computeFilesNeedingDownload(
      { version: 2, files: [current] },
      { version: 2, files: [cached] },
      ["resource-assets/a.png"],
    )).toEqual([current]);
  });
});
