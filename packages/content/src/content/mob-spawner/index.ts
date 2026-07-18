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
export * from "./collaborate/collaborate-test-arena-2/waves";
export * from "./collaborate/collaborate-test-arena-2/mobs/test-arena-2-fairy";
export * from "./collaborate/collaborate-test-arena-2/elites/test-arena-2-cirno-elite";
export * from "./collaborate/collaborate-test-arena-2/boss/test-arena-2-ellen-boss";
export * from "./json/registry";
export * from "./json/json-spawner";
export * from "./json/json-mob";

import { DefaultMobSpawnerA } from "./default-a";
import { ExampleCollaborateMobSpawner } from "./collaborate/example-collaborate-mob-spawner/waves";
import { CollaborateTestArena2MobSpawner } from "./collaborate/collaborate-test-arena-2/waves";
import { ShootingRangeSpawn } from "./shooting-range-spawn";
import type { NeutralMobSpawner } from "./base";
import { createSampleStage } from "@repo/stage-schema";
import { getRegisteredStage, registerJsonStage } from "./json/registry";
import { JsonMobSpawner } from "./json/json-spawner";

/**
 * Resolve a NeutralMobSpawner by its ID string.
 * Returns undefined for unknown/unregistered spawner IDs.
 */
export function resolveMobSpawner(
  spawnerId: string,
): NeutralMobSpawner | undefined {
  if (spawnerId.startsWith("json:")) {
    const doc = getRegisteredStage(spawnerId.slice("json:".length));
    if (doc) return new JsonMobSpawner(doc);
    return undefined;
  }
  switch (spawnerId) {
    case "default-a":
      return new DefaultMobSpawnerA();
    case "example-collaborate-mob-spawner":
      return new ExampleCollaborateMobSpawner();
    case "collaborate-test-arena-2-mob-spawner":
      return new CollaborateTestArena2MobSpawner();
    case "shoot_range_spawn":
      return new ShootingRangeSpawn();
    default:
      return undefined;
  }
}

// Register the bundled sample stage so it is immediately usable as
// `json:sample-stage` (e.g. via the map `sample_json_stage`).
registerJsonStage(createSampleStage());
