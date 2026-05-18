import type { MapId } from "../../core";

export interface MapDefinition {
  readonly id: MapId;
  readonly name: string;
  readonly width: number;
  readonly height: number;
  readonly spawnPoints: readonly SpawnPointDefinition[];
}

export interface SpawnPointDefinition {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly facingAngleTicks: number;
}
