import type { MobState } from "@repo/types";

import type { BattleMob } from "../mob-spawner/base";

type FamiliarSnapshotFactory = (snapshot: MobState) => BattleMob | undefined;

const factories: FamiliarSnapshotFactory[] = [];

export function registerFamiliarSnapshotFactory(
  factory: FamiliarSnapshotFactory,
): void {
  factories.push(factory);
}

export function createFamiliarFromSnapshot(
  snapshot: MobState,
): BattleMob | undefined {
  for (const factory of factories) {
    const mob = factory(snapshot);
    if (mob) {
      return mob;
    }
  }
  return undefined;
}
