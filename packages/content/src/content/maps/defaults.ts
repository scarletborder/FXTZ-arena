import {
  ARENA_HEIGHT,
  ARENA_WIDTH,
  COLLABORATE_ARENA_HEIGHT,
  COLLABORATE_ARENA_WIDTH,
  COLLABORATE_VIEWPORT_HEIGHT,
  COLLABORATE_VIEWPORT_WIDTH,
} from "@repo/constants";
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
  bgmKey: "bgm_hakurei-shrine",
  spawnPoints: STANDARD_SPAWN_POINTS,
  mobSpawnerId: "default-a",
};

const COLLABORATE_TEST_ARENA: MapDefinition = {
  id: "collaborate_test_arena",
  name: "合作测试竞技场",
  width: COLLABORATE_ARENA_WIDTH,
  height: COLLABORATE_ARENA_HEIGHT,
  viewportWidth: COLLABORATE_VIEWPORT_WIDTH,
  viewportHeight: COLLABORATE_VIEWPORT_HEIGHT,
  background: {
    textureKey: "map-bg-collaborate-test-arena",
    assetPath: "assets/bg/arena_standard.jpg",
  },
  bgmKey: "bgm_hakurei-shrine",
  spawnPoints: [
    {
      id: "left",
      x: COLLABORATE_ARENA_WIDTH / 2 - 160,
      y: COLLABORATE_ARENA_HEIGHT / 2,
      facingAngleTicks: 0,
    },
    {
      id: "right",
      x: COLLABORATE_ARENA_WIDTH / 2 + 160,
      y: COLLABORATE_ARENA_HEIGHT / 2,
      facingAngleTicks: 30000,
    },
  ],
  mobSpawnerId: "default-a",
};

export const DEFAULT_MAPS: readonly MapDefinition[] = [
  HAKUREI_SHRINE,
  {
    ...HAKUREI_SHRINE,
    id: "mist_lake",
    name: "雾之湖",
    background: {
      textureKey: "map-bg-mist-lake",
      assetPath: "assets/bg/mist_lake.png",
    },
  },
  {
    ...HAKUREI_SHRINE,
    id: "bamboo_lost",
    name: "迷途竹林",
    background: {
      textureKey: "map-bg-bamboo-lost",
      assetPath: "assets/bg/lostbamboo.png",
    },
  },
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
  COLLABORATE_TEST_ARENA,
];

export function getCombatMapDefinition(
  mapId: string,
): MapDefinition | undefined {
  return DEFAULT_MAPS.find((map) => map.id === mapId);
}

export function getAvailableCombatMaps(): readonly MapDefinition[] {
  return getAvailableVersusMaps();
}

export function getAvailableVersusMaps(): readonly MapDefinition[] {
  return DEFAULT_MAPS.filter(
    (map) => map.id !== "shoot_range" && map.id !== "collaborate_test_arena",
  );
}

export function getAvailableCollaborateMaps(): readonly MapDefinition[] {
  return [COLLABORATE_TEST_ARENA];
}

export const get_available_combat_maps = getAvailableCombatMaps;
