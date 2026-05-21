export * from "./base";
export * from "./default-a";
export * from "./mobs/example-fairy";

import { DefaultMobSpawnerA } from "./default-a";
import type { NeutralMobSpawner } from "./base";

/**
 * Resolve a NeutralMobSpawner by its ID string.
 * Returns undefined for unknown/unregistered spawner IDs.
 */
export function resolveMobSpawner(spawnerId: string): NeutralMobSpawner | undefined {
  switch (spawnerId) {
    case "default-a":
      return new DefaultMobSpawnerA();
    default:
      return undefined;
  }
}
