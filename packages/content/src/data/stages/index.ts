import type { StageDocument } from "@repo/stage-schema";

// Auto-loaded stage JSON documents. To add a new stage:
//   1. Drop the .json file in this directory.
//   2. Add an import + array entry below.
//
// Each document is registered as `json:<id>` at module load (see
// mob-spawner/index.ts) and exposed as a collaborate map (see
// maps/defaults.ts).
import newTestArena from "./new-test-arena.json";

export const BUNDLED_STAGE_DOCS: readonly StageDocument[] = [
  newTestArena as StageDocument,
];
