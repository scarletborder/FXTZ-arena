import { ARENA_HEIGHT, ARENA_WIDTH } from "../../core";
import type { MapDefinition } from "./types";

export const DEFAULT_MAPS: readonly MapDefinition[] = [
  {
    id: "arena_standard",
    name: "标准竞技场",
    width: ARENA_WIDTH,
    height: ARENA_HEIGHT,
    spawnPoints: [
      { id: "left", x: -ARENA_WIDTH / 4, y: 0, facingAngleTicks: 0 },
      { id: "right", x: ARENA_WIDTH / 4, y: 0, facingAngleTicks: 30000 },
    ],
  },
];
