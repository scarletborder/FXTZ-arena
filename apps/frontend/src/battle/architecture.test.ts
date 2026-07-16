import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

describe("battle architecture boundaries", () => {
  it("keeps battle sessions independent from Phaser", () => {
    expect(
      findForbiddenImports("./session", [
        /from\s+["']phaser["']/,
        /from\s+["'][^"']*network\/(?!combat)[^"']*["']/,
      ]),
    ).toEqual([]);
  });

  it("keeps combat synchronization independent from Phaser", () => {
    expect(
      findForbiddenImports("../network/combat", [/from\s+["']phaser["']/]),
    ).toEqual([]);
  });

  it("keeps battle views independent from networking and mutable runtimes", () => {
    expect(
      findForbiddenImports("./view", [
        /from\s+["'][^"']*network[^"']*["']/,
        /from\s+["'][^"']*runtime-adapter[^"']*["']/,
        /import[^;]*(?:RaidLogicRuntime|createRaidLogicRuntime)[^;]*from/,
      ]),
    ).toEqual([]);
  });
});

function findForbiddenImports(
  relativeDirectory: string,
  patterns: readonly RegExp[],
): string[] {
  const directory = fileURLToPath(new URL(relativeDirectory, import.meta.url));
  return sourceFiles(directory).flatMap((file) => {
    const source = readFileSync(file, "utf8");
    return patterns.some((pattern) => pattern.test(source)) ? [file] : [];
  });
}

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = `${directory}/${entry.name}`;
    if (entry.isDirectory()) return sourceFiles(path);
    return entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts")
      ? [path]
      : [];
  });
}
