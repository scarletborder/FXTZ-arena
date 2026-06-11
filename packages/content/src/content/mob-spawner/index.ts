export * from "./base";
export * from "./default-a";
export * from "./shooting-range-spawn";
export * from "./mobs/example-fairy";
export * from "./mobs/horizontal-fairy";
export * from "./mobs/elite-fairy";
export * from "./mobs/immortal-fairy";
export * from "./collaborate/wave-types";
export * from "./collaborate/wave-spawner";
export * from "./collaborate/spell-card";
export * from "./collaborate/example-collaborate-mob-spawner/waves";
export * from "./collaborate/example-collaborate-mob-spawner/elites/collaborate-elite-fairy";
export * from "./collaborate/example-collaborate-mob-spawner/boss/collaborate-boss-fairy";

import { DefaultMobSpawnerA } from "./default-a";
import { ExampleCollaborateMobSpawner } from "./collaborate/example-collaborate-mob-spawner/waves";
import { ShootingRangeSpawn } from "./shooting-range-spawn";
import type { NeutralMobSpawner } from "./base";

/**
 * Resolve a NeutralMobSpawner by its ID string.
 * Returns undefined for unknown/unregistered spawner IDs.
 */
export function resolveMobSpawner(
  spawnerId: string,
): NeutralMobSpawner | undefined {
  switch (spawnerId) {
    case "default-a":
      return new DefaultMobSpawnerA();
    case "example-collaborate-mob-spawner":
      return new ExampleCollaborateMobSpawner();
    case "shoot_range_spawn":
      return new ShootingRangeSpawn();
    default:
      return undefined;
  }
}
