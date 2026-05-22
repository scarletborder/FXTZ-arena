import { secondsToTicks } from "../seconds-to-ticks";
import { NeutralMobSpawner, type BattleNeutralMob, type NeutralMobSpawnerContext, type NeutralMobSpawnerState } from "./base";
import { ImmortalFairy } from "./mobs/immortal-fairy";
import type { NeutralMobState } from "@repo/types";

export interface ShootingRangeSpawnState extends NeutralMobSpawnerState {
  readonly spawnerId: "shooting_range_spawn";
}

const SPAWN_FRAME = secondsToTicks(1);

export class ShootingRangeSpawn extends NeutralMobSpawner<ShootingRangeSpawnState> {
  readonly id = "shooting_range_spawn";

  step(ctx: NeutralMobSpawnerContext): void {
    if (ctx.frame !== SPAWN_FRAME) {
      return;
    }
    ctx.spawnMob(new ImmortalFairy({ id: ctx.allocateMobId() }));
  }

  snapshot(): ShootingRangeSpawnState {
    return { spawnerId: this.id };
  }

  restore(_snapshot: ShootingRangeSpawnState): void {
    // Shooting range spawn is frame-derived and has no hidden counters.
  }

  reset(): void {
    // Shooting range spawn is frame-derived and has no hidden counters.
  }

  createMobFromSnapshot(snapshot: NeutralMobState): BattleNeutralMob | undefined {
    if (snapshot.kind !== "immortal_fairy") {
      return undefined;
    }
    return ImmortalFairy.fromSnapshot(snapshot);
  }
}
