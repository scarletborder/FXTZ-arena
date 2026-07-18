import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type {
  StageDocument,
  StageNode,
  WaveNode,
  ShopNode,
  EnemyDefinition,
  BulletPreset,
  ShopConfig,
} from "@repo/stage-schema";
import { validateStageDocument } from "@repo/stage-schema";

export type Section = "node" | "enemy" | "bullet" | "shop";

export interface LocatedNode {
  index: number;
  node: StageNode;
}

export function readStage(path: string): StageDocument {
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch (e) {
    throw new Error(`Cannot read stage file "${path}": ${(e as Error).message}`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    throw new Error(`"${path}" is not valid JSON: ${(e as Error).message}`);
  }
  const doc = parsed as Partial<StageDocument>;
  if (!doc || doc.schemaVersion !== 1 || typeof doc.id !== "string") {
    throw new Error(
      `"${path}" is not a maker stage document (expected schemaVersion:1 and an id).`,
    );
  }
  return parsed as StageDocument;
}

export function writeStage(path: string, doc: StageDocument): void {
  const dir = dirname(path);
  if (dir) mkdirSync(dir, { recursive: true });
  writeFileSync(path, JSON.stringify(doc, null, 2) + "\n", "utf8");
}

/** Resolves a node reference: exact id, or `#n` / a bare number for 1-based index. */
export function resolveNodeIndex(nodes: StageNode[], ref: string): number | undefined {
  const hashMatch = /^#(\d+)$/.exec(ref);
  if (hashMatch) {
    const idx = Number(hashMatch[1]) - 1;
    return idx >= 0 && idx < nodes.length ? idx : undefined;
  }
  if (/^\d+$/.test(ref)) {
    const idx = Number(ref) - 1;
    if (idx >= 0 && idx < nodes.length) return idx;
  }
  return nodes.findIndex((n) => n.id === ref);
}

export function locateNode(doc: StageDocument, ref: string): LocatedNode {
  const idx = resolveNodeIndex(doc.nodes, ref);
  if (idx === undefined || idx < 0) {
    throw new Error(`No node matching "${ref}". Use a node id or #<1-based index>.`);
  }
  return { index: idx, node: doc.nodes[idx]! };
}

export function locateEnemy(doc: StageDocument, id: string): EnemyDefinition {
  const def = doc.enemyDefs[id];
  if (!def) throw new Error(`No enemy definition with id "${id}".`);
  return def;
}

export function locateBullet(doc: StageDocument, id: string): BulletPreset {
  const preset = doc.bulletPresets?.[id];
  if (!preset) throw new Error(`No bullet preset with id "${id}".`);
  return preset;
}

export function locateShop(doc: StageDocument, id: string): ShopConfig {
  const preset = doc.shopPresets?.[id];
  if (!preset) throw new Error(`No shop preset with id "${id}".`);
  return preset;
}

export function assertWave(node: StageNode): asserts node is WaveNode {
  if (node.kind !== "wave") throw new Error(`Node "${node.id}" is a shop, not a wave.`);
}

export function assertShop(node: StageNode): asserts node is ShopNode {
  if (node.kind !== "shop") throw new Error(`Node "${node.id}" is a wave, not a shop.`);
}

/** Runs validation and returns error-severity issues (empty when clean). */
export function validationErrors(doc: StageDocument): string[] {
  return validateStageDocument(doc)
    .filter((i) => i.severity === "error")
    .map((i) => `  • ${i.path}: ${i.message}`);
}
