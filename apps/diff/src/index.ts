import { readFile } from "node:fs/promises";
import path from "node:path";
import { inspect } from "node:util";

interface BattleDebugLog {
  readonly frames?: readonly RawFrameRecord[];
}

interface RawFrameRecord {
  readonly frame?: unknown;
  readonly hash?: unknown;
  readonly player1Input?: unknown;
  readonly player2Input?: unknown;
  readonly playerInput?: unknown;
  readonly targetInput?: unknown;
}

interface FrameRecord {
  readonly frame: number;
  readonly hash: string | null;
  readonly player1Input: unknown;
  readonly player2Input: unknown;
}

interface FrameDiff {
  readonly frame: number;
  readonly issues: readonly string[];
  readonly p1: FrameRecord | null;
  readonly p2: FrameRecord | null;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const p1Path = args.get("p1");
  const p2Path = args.get("p2");

  if (!p1Path || !p2Path) {
    printUsage();
    process.exitCode = 2;
    return;
  }

  const left = await readDebugLog(p1Path);
  const right = await readDebugLog(p2Path);
  const diffs = diffLogs(left, right);

  if (diffs.length === 0) {
    console.log(`FXTZ diff: no hash/input differences (${left.size} vs ${right.size} frames).`);
    return;
  }

  console.log(`FXTZ diff: ${diffs.length} differing frame(s)`);
  for (const diff of diffs) {
    printDiff(diff);
  }
}

function parseArgs(argv: readonly string[]): Map<string, string> {
  const result = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]!;
    if (!arg.startsWith("--")) {
      continue;
    }

    const equalsIndex = arg.indexOf("=");
    if (equalsIndex !== -1) {
      result.set(arg.slice(2, equalsIndex), arg.slice(equalsIndex + 1));
      continue;
    }

    const next = argv[index + 1];
    if (next && !next.startsWith("--")) {
      result.set(arg.slice(2), next);
      index += 1;
    }
  }
  return result;
}

async function readDebugLog(filePath: string): Promise<Map<number, FrameRecord>> {
  const absolutePath = path.resolve(filePath);
  const raw = await readFile(absolutePath, "utf8");
  const parsed = JSON.parse(raw) as BattleDebugLog;
  if (!Array.isArray(parsed.frames)) {
    throw new Error(`${absolutePath} is not an FXTZ debug log: missing frames[]`);
  }

  const frames = new Map<number, FrameRecord>();
  for (const rawFrame of parsed.frames) {
    const frame = Number(rawFrame.frame);
    if (!Number.isInteger(frame) || frame < 0) {
      continue;
    }
    frames.set(frame, {
      frame,
      hash: typeof rawFrame.hash === "string" ? rawFrame.hash : null,
      player1Input: rawFrame.player1Input ?? rawFrame.playerInput ?? null,
      player2Input: rawFrame.player2Input ?? rawFrame.targetInput ?? null,
    });
  }
  return frames;
}

function diffLogs(left: Map<number, FrameRecord>, right: Map<number, FrameRecord>): FrameDiff[] {
  const frames = Array.from(new Set([...Array.from(left.keys()), ...Array.from(right.keys())])).sort((a, b) => a - b);
  const diffs: FrameDiff[] = [];

  for (const frame of frames) {
    const p1 = left.get(frame) ?? null;
    const p2 = right.get(frame) ?? null;
    const issues: string[] = [];

    if (!p1 || !p2) {
      issues.push(!p1 ? "missing-in-p1" : "missing-in-p2");
    } else {
      if (p1.hash !== p2.hash) {
        issues.push("hash");
      }
      if (!sameValue(p1.player1Input, p2.player1Input)) {
        issues.push("player1Input");
      }
      if (!sameValue(p1.player2Input, p2.player2Input)) {
        issues.push("player2Input");
      }
    }

    if (issues.length > 0) {
      diffs.push({ frame, issues, p1, p2 });
    }
  }

  return diffs;
}

function sameValue(left: unknown, right: unknown): boolean {
  return stableStringify(left) === stableStringify(right);
}

function stableStringify(value: unknown): string {
  return JSON.stringify(normalize(value));
}

function normalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(normalize);
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(record).sort()) {
      sorted[key] = normalize(record[key]);
    }
    return sorted;
  }
  return value;
}

function printDiff(diff: FrameDiff): void {
  console.log(`\nframe ${diff.frame}: ${diff.issues.join(", ")}`);
  if (diff.issues.includes("hash")) {
    console.log(`  hash: ${diff.p1?.hash ?? "<missing>"} != ${diff.p2?.hash ?? "<missing>"}`);
  }
  if (diff.issues.includes("player1Input")) {
    console.log("  player1Input:");
    console.log(`    p1 ${formatValue(diff.p1?.player1Input)}`);
    console.log(`    p2 ${formatValue(diff.p2?.player1Input)}`);
  }
  if (diff.issues.includes("player2Input")) {
    console.log("  player2Input:");
    console.log(`    p1 ${formatValue(diff.p1?.player2Input)}`);
    console.log(`    p2 ${formatValue(diff.p2?.player2Input)}`);
  }
}

function formatValue(value: unknown): string {
  return inspect(value, { compact: true, breakLength: 160, depth: null, sorted: true });
}

function printUsage(): void {
  console.error("Usage: pnpm run diff --p1=a.json --p2=b.json");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 2;
});
