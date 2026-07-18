import type {
  StageNode,
  WaveNode,
  ShopNode,
  EnemyDefinition,
  BulletPreset,
  ShopConfig,
} from "@repo/stage-schema";

/** A minimal, valid wave node to append to the timeline. */
export function defaultWaveNode(id: string): WaveNode {
  return {
    kind: "wave",
    id,
    minNextWaveSeconds: 8,
    maxNextWaveSeconds: 18,
    members: [],
  };
}

/** A minimal shop node. */
export function defaultShopNode(id: string, arena: { width: number; height: number }): ShopNode {
  return {
    kind: "shop",
    id,
    x: Math.round(arena.width / 2),
    y: Math.round(arena.height / 2),
    rarityPulls: { common: 4, rare: 1 },
  };
}

/** A minimal enemy definition (minion). */
export function defaultEnemy(id: string, arena: { width: number; height: number }): EnemyDefinition {
  return {
    id,
    class: "minion",
    maxHealth: 100,
    hitRadius: 28,
    spawn: { x: Math.round(arena.width / 2), y: -40 },
    rewards: { drops: [] },
  };
}

/** A minimal bullet preset (orb, medium). */
export function defaultBulletPreset(id: string): BulletPreset {
  return {
    id,
    bullet: {
      kind: "orb",
      speedRank: "medium",
      width: 12,
      height: 12,
      color: "#ffd166",
    },
  };
}

/** A minimal shop preset. */
export function defaultShopConfig(id: string): ShopConfig {
  return {
    id,
    rarityPulls: { common: 4, rare: 1 },
  };
}

export function clone<T>(value: T): T {
  return structuredClone(value);
}
