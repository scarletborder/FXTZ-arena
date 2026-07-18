import type { AbilityCardId, CharacterId } from "../core";
import type { CollaborateExtraState } from "./collaborate-extra";
import type { MobState } from "./neutral-mob";
import type {
  BattleResult,
  ClearRingState,
  EffectState,
  FighterState,
  PointState,
  ProjectileState,
  TrainingStats,
} from "./runtime-state";

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

export interface TickerManagerSnapshot {
  readonly currentFrame: number;
  readonly nextTimerId: number;
  readonly timers: readonly {
    readonly id: number;
    readonly targetIn: number;
    readonly group: string;
  }[];
}

export interface ProjectileTimerSnapshot {
  readonly visibleIn: number;
  readonly expireIn: number | undefined;
  readonly damageFromIn: number | undefined;
  readonly damageUntilIn: number | undefined;
  readonly homingStartIn: number;
  readonly homingRemaining: number;
  readonly pausedRemaining: number;
  readonly retargetIn: number | undefined;
}

export interface ProjectileCommandSnapshot {
  readonly id: number;
  readonly kind: "bullet" | "laser";
  readonly params: NeutralMobSpawnerStateValue;
  readonly startIn: number;
  readonly burstCount: number;
  readonly burstInterval: number;
  readonly repeatCount: number;
  readonly repeatInterval: number;
  readonly forwardStep: number;
  readonly sideStep: number;
  readonly angleStep: number;
  readonly burstIndex: number;
  readonly repeatIndex: number;
}

export interface BattleModelSnapshot {
  readonly version: 1;
  readonly frame: number;
  readonly gameOver: boolean;
  readonly result?: BattleResult;
  readonly nextProjectileId: number;
  readonly nextEffectId: number;
  readonly nextNeutralMobId: number;
  readonly nextPointId: number;
  readonly nextClearRingId: number;
  readonly player: FighterSnapshot;
  readonly target: FighterSnapshot;
  readonly neutralMobs: readonly MobState[];
  readonly points: readonly PointState[];
  readonly clearRings: readonly ClearRingSnapshot[];
  readonly mobSpawner: NeutralMobSpawnerState | undefined;
  readonly ticker?: TickerManagerSnapshot;
  readonly nextProjectileCommandId?: number;
  readonly projectileCommands?: readonly ProjectileCommandSnapshot[];
  readonly projectiles: readonly ProjectileSnapshot[];
  readonly effects: readonly EffectSnapshot[];
  readonly stats: TrainingStats;
  readonly collaborateExtra?: CollaborateExtraState;
}

export type FighterSnapshot = Omit<
  FighterState,
  | "primaryCharacter"
  | "activeCharacter"
  | "alternateCharacter"
  | "activeCard"
  | "abilityCards"
  | "flashUntil"
  | "statusVisibleUntil"
> & {
  readonly primaryCharacterId: CharacterId;
  readonly activeCharacterId: CharacterId;
  readonly alternateCharacterId: CharacterId;
  readonly activeCardId: AbilityCardId | undefined;
  readonly abilityCardIds: readonly AbilityCardId[];
  readonly flashRemaining: number;
  readonly statusVisibleRemaining: number;
};

export type ProjectileSnapshot = Omit<
  ProjectileState,
  | "visibleFrom"
  | "expireAt"
  | "damageFrom"
  | "damageUntil"
  | "homingStartAt"
  | "homingUntil"
  | "pausedUntil"
  | "retargetAt"
> &
  ProjectileTimerSnapshot;

export type EffectSnapshot = Omit<EffectState, "expireAt"> & {
  readonly expireIn: number;
};

export type ClearRingSnapshot = Omit<ClearRingState, "expireAt"> & {
  readonly expireIn: number;
};

export type NeutralMobSnapshot = MobState;
export type PointSnapshot = PointState;
