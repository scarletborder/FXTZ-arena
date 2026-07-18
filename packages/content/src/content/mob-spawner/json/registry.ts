import type { StageDocument } from "@repo/stage-schema";
import { JsonMobSpawner } from "./json-spawner";

const registry = new Map<string, StageDocument>();

/** Register a JSON stage so it can be resolved by `json:<id>`. */
export function registerJsonStage(doc: StageDocument): void {
  registry.set(doc.id, doc);
}

export function getRegisteredStage(id: string): StageDocument | undefined {
  return registry.get(id);
}

export function listRegisteredStages(): readonly StageDocument[] {
  return Array.from(registry.values());
}

export function createJsonMobSpawner(doc: StageDocument): JsonMobSpawner {
  return new JsonMobSpawner(doc);
}
