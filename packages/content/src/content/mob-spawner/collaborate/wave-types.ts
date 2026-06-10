import type { NeutralMobSpawnerContext } from "../base";

export type MobClass = "minion" | "elite" | "boss";
export type WaveNodeKind = "wave" | "shop";

export interface WaveMemberDefinition {
  readonly key: string;
  readonly class: MobClass;
  readonly spawnAtSeconds?: number;
  spawn(ctx: NeutralMobSpawnerContext, params: WaveMemberSpawnParams): void;
}

export interface WaveMemberSpawnParams {
  readonly waveId: number;
  readonly waveIndex: number;
  readonly memberIndex: number;
  readonly memberKey: string;
}

export interface WaveDefinition {
  readonly id: string;
  readonly kind: "wave";
  readonly members: readonly WaveMemberDefinition[];
  readonly minNextWaveSeconds: number;
  readonly maxNextWaveSeconds: number;
}

export interface ShopDefinition {
  readonly id: string;
  readonly kind: "shop";
  readonly x: number;
  readonly y: number;
  readonly rarityPulls: Readonly<Partial<Record<"common" | "rare", number>>>;
}

export type CollaborateSpawnerNode = WaveDefinition | ShopDefinition;

export interface WaveSpawnerState {
  readonly spawnerId: string;
  readonly nodeIndex: number;
  readonly phase: "running" | "transition_sync" | "shop";
  readonly shopIndex: number;
  readonly waveStartFrame: number;
  readonly nextWaveAllowedFrame: number;
  readonly forceNextWaveFrame: number;
  readonly spawnedMemberKeys: readonly string[];
}
