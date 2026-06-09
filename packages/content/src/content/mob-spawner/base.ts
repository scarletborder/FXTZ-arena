import type { NeutralMob, NeutralMobState } from "@repo/types";

import type { FighterState } from "../battle-types";
import type {
  BattleBulletSpawnParams,
  BattleLaserSpawnParams,
} from "../characters/base";
import type { ArenaBounds } from "@repo/constants";

export type NeutralMobSpawnerStateValue =
  | string
  | number
  | boolean
  | null
  | readonly NeutralMobSpawnerStateValue[]
  | { readonly [key: string]: NeutralMobSpawnerStateValue };

export interface NeutralMobSpawnerState {
  readonly spawnerId: string;
  readonly [key: string]: NeutralMobSpawnerStateValue;
}

export type BattleNeutralMob = NeutralMob<
  NeutralMobState,
  BattleBulletSpawnParams,
  BattleLaserSpawnParams
>;

export interface NeutralMobSpawnerContext {
  readonly frame: number;
  readonly arenaBounds: ArenaBounds;
  readonly player: FighterState;
  readonly target: FighterState;
  readonly neutralMobs: readonly BattleNeutralMob[];
  allocateMobId(params?: {
    readonly waveId: number;
    readonly waveMemberIndex: number;
  }): number;
  spawnMob(mob: BattleNeutralMob): void;
}

export abstract class NeutralMobSpawner<
  TState extends NeutralMobSpawnerState = NeutralMobSpawnerState,
> {
  abstract readonly id: string;

  abstract step(ctx: NeutralMobSpawnerContext): void;
  abstract snapshot(): TState;
  abstract restore(snapshot: TState): void;
  abstract reset(): void;
  abstract createMobFromSnapshot(
    snapshot: NeutralMobState,
  ): BattleNeutralMob | undefined;
}
