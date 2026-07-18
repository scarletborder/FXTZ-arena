import {
  ARENA_HEIGHT,
  ARENA_WIDTH,
  COLLABORATE_ARENA_HEIGHT,
  COLLABORATE_ARENA_WIDTH,
  COLLABORATE_VIEWPORT_HEIGHT,
  COLLABORATE_VIEWPORT_WIDTH,
  PLAYER_SPAWN,
  TARGET_SPAWN,
} from "@repo/constants";
import { createSampleStage } from "@repo/stage-schema";
import type { MapDefinition } from "./types";

const STANDARD_SPAWN_POINTS = [
  { id: "left", x: PLAYER_SPAWN.x, y: PLAYER_SPAWN.y, facingAngleTicks: 0 },
  {
    id: "right",
    x: TARGET_SPAWN.x,
    y: TARGET_SPAWN.y,
    facingAngleTicks: 30000,
  },
] as const;

const HAKUREI_SHRINE: MapDefinition = {
  id: "hakurei_shrine",
  name: "content.maps.hakurei_shrine.name",
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
  name: "content.maps.collaborate_test_arena.name",
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
      x: 1200,
      y: 720,
      facingAngleTicks: 0,
    },
    {
      id: "right",
      x: 1200,
      y: 720,
      facingAngleTicks: 30000,
    },
  ],
  mobSpawnerId: "example-collaborate-mob-spawner",
};

const COLLABORATE_TEST_ARENA_2: MapDefinition = {
  ...COLLABORATE_TEST_ARENA,
  id: "collaborate_test_arena_2",
  name: "content.maps.collaborate_test_arena_2.name",
  mobSpawnerId: "collaborate-test-arena-2-mob-spawner",
};

const SAMPLE_JSON_STAGE_MAP: MapDefinition = {
  id: "sample_json_stage",
  name: "content.maps.sample_json_stage.name",
  width: ARENA_WIDTH,
  height: ARENA_HEIGHT,
  background: {
    textureKey: "map-bg-hakurei-shrine",
    assetPath: "assets/bg/arena_standard.jpg",
  },
  bgmKey: "bgm_hakurei-shrine",
  spawnPoints: [
    { id: "left", x: PLAYER_SPAWN.x, y: PLAYER_SPAWN.y, facingAngleTicks: 0 },
    { id: "right", x: TARGET_SPAWN.x, y: TARGET_SPAWN.y, facingAngleTicks: 30000 },
  ],
  mobSpawnerId: "json:sample-stage",
};

export const DEFAULT_MAPS: readonly MapDefinition[] = [
  HAKUREI_SHRINE,
  {
    ...HAKUREI_SHRINE,
    id: "mist_lake",
    name: "content.maps.mist_lake.name",
    background: {
      textureKey: "map-bg-mist-lake",
      assetPath: "assets/bg/mist_lake.png",
    },
  },
  {
    ...HAKUREI_SHRINE,
    id: "bamboo_lost",
    name: "content.maps.bamboo_lost.name",
    background: {
      textureKey: "map-bg-bamboo-lost",
      assetPath: "assets/bg/lostbamboo.png",
    },
  },
  {
    ...HAKUREI_SHRINE,
    id: "mana_forest",
    name: "content.maps.mana_forest.name",
    background: {
      textureKey: "map-bg-mana-forest",
      assetPath: "assets/bg/mana_forest.png",
    },
  },
  {
    ...HAKUREI_SHRINE,
    id: "x_shoot_range",
    name: "content.maps.x_shoot_range.name",
    background: {
      textureKey: "map-bg-x-shoot-range",
      assetPath: "assets/bg/shoot_range.png",
    },
  },
  {
    id: "shoot_range",
    name: "content.maps.shoot_range.name",
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
  COLLABORATE_TEST_ARENA_2,
  SAMPLE_JSON_STAGE_MAP,
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
    (map) =>
      map.id !== "shoot_range" &&
      map.id !== "collaborate_test_arena" &&
      map.id !== "collaborate_test_arena_2" &&
      map.id !== "sample_json_stage",
  );
}

export function getAvailableCollaborateMaps(): readonly MapDefinition[] {
  return [COLLABORATE_TEST_ARENA, COLLABORATE_TEST_ARENA_2, SAMPLE_JSON_STAGE_MAP];
}

export const get_available_combat_maps = getAvailableCombatMaps;
