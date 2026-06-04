import { ARENA_HEIGHT, ARENA_WIDTH } from "@repo/constants";
import type { MapDefinition } from "./types";

const STANDARD_SPAWN_POINTS = [
  { id: "left", x: -ARENA_WIDTH / 4, y: 0, facingAngleTicks: 0 },
  {
    id: "right",
    x: ARENA_WIDTH / 4,
    y: 0,
    facingAngleTicks: 30000,
  },
] as const;

const HAKUREI_SHRINE: MapDefinition = {
  id: "hakurei_shrine",
  name: "博丽神社",
  width: ARENA_WIDTH,
  height: ARENA_HEIGHT,
  background: {
    textureKey: "map-bg-hakurei-shrine",
    assetPath: "assets/bg/arena_standard.jpg",
  },
  spawnPoints: STANDARD_SPAWN_POINTS,
  mobSpawnerId: "default-a",
};

export const DEFAULT_MAPS: readonly MapDefinition[] = [
  HAKUREI_SHRINE,
  {
    ...HAKUREI_SHRINE,
    id: "mana_forest",
    name: "魔力森林",
    background: {
      textureKey: "map-bg-mana-forest",
      assetPath: "assets/bg/mana_forest.png",
    },
  },
  {
    ...HAKUREI_SHRINE,
    id: "x_shoot_range",
    name: "X靶场",
    background: {
      textureKey: "map-bg-x-shoot-range",
      assetPath: "assets/bg/shoot_range.png",
    },
  },
  {
    id: "shoot_range",
    name: "靶场",
    width: ARENA_WIDTH,
    height: ARENA_HEIGHT,
    background: {
      textureKey: "map-bg-shooting-range",
      assetPath: "assets/bg/shoot_range.png",
    },
    spawnPoints: STANDARD_SPAWN_POINTS,
    mobSpawnerId: "shoot_range_spawn",
  },
];

export function getCombatMapDefinition(mapId: string): MapDefinition | undefined {
  return DEFAULT_MAPS.find((map) => map.id === mapId);
}

export function getAvailableCombatMaps(): readonly MapDefinition[] {
  return DEFAULT_MAPS.filter((map) => map.id !== "shoot_range");
}

export const get_available_combat_maps = getAvailableCombatMaps;
