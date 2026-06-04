import type { MapId } from "../ids";

export interface MapDefinition {
  readonly id: MapId;
  readonly name: string;
  readonly width: number;
  readonly height: number;
  readonly background: MapBackgroundDefinition;
  readonly spawnPoints: readonly SpawnPointDefinition[];
  readonly mobSpawnerId?: string;
}

export interface MapBackgroundDefinition {
  readonly textureKey: string;
  readonly assetPath: string;
}

export interface SpawnPointDefinition {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly facingAngleTicks: number;
}
