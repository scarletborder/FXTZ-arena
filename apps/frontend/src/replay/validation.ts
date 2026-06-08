import type { ReplayFile, ReplayFrame, ReplayBattleRecord } from "./types";

/**
 * Check if a value is a plain object (not null, not array).
 */
function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * Check if a value is a non-empty string.
 */
function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.length > 0;
}

/**
 * Validate a single ReplayFrame.
 */
function isValidBattleInputState(state: unknown): boolean {
  if (!isObject(state)) return false;
  const s = state as Record<string, unknown>;

  // moveX / moveY: number (-1, 0, or 1)
  if (typeof s.moveX !== "number" || ![-1, 0, 1].includes(s.moveX)) return false;
  if (typeof s.moveY !== "number" || ![-1, 0, 1].includes(s.moveY)) return false;

  // aimX / aimY: number
  if (typeof s.aimX !== "number" || typeof s.aimY !== "number") return false;

  // boolean fields
  const boolFields = ["shootPressed", "bombPressed", "activeCardPressed", "reloadPressed", "alternateHeld", "infoHeld"];
  for (const f of boolFields) {
    if (typeof s[f] !== "boolean") return false;
  }

  return true;
}

function isValidReplayFrame(frame: unknown): frame is ReplayFrame {
  if (!isObject(frame)) return false;
  if (typeof frame.frame !== "number" || frame.frame < 0) return false;

  const p1 = frame.player1;
  const p2 = frame.player2;
  if (!isValidBattleInputState(p1) || !isValidBattleInputState(p2)) return false;

  return true;
}

/**
 * Validate a single ReplayBattleRecord.
 */
function isValidReplayBattleRecord(battle: unknown): battle is ReplayBattleRecord {
  if (!isObject(battle)) return false;

  const b = battle as Record<string, unknown>;

  // inputs must be a non-empty array of valid frames
  if (!Array.isArray(b.inputs) || b.inputs.length === 0) return false;
  if (!b.inputs.every(isValidReplayFrame)) return false;

  // playerName / opponentName
  if (!isNonEmptyString(b.playerName) || !isNonEmptyString(b.opponentName)) return false;

  // mapId must be a string
  if (typeof b.mapId !== "string") return false;

  // initial point fields are optional for legacy replays, but must be numbers when present
  if (b.playerInitPoint !== undefined && typeof b.playerInitPoint !== "number") return false;
  if (b.opponentInitPoint !== undefined && typeof b.opponentInitPoint !== "number") return false;

  // stageIndex (optional)
  if (b.stageIndex !== undefined && typeof b.stageIndex !== "number") return false;

  // stageTitle (optional)
  if (b.stageTitle !== undefined && typeof b.stageTitle !== "string") return false;

  return true;
}

/**
 * Validate that a parsed JSON object is a valid ReplayFile.
 * Returns the validated ReplayFile, or null if validation fails.
 */
export function validateReplayJson(data: unknown): ReplayFile | null {
  if (!isObject(data)) return null;

  const obj = data as Record<string, unknown>;

  // version must be 1
  if (obj.version !== 1) return null;

  // title must be a non-empty string
  if (!isNonEmptyString(obj.title)) return null;

  // timestamp must be a positive number
  if (typeof obj.timestamp !== "number" || obj.timestamp <= 0) return null;

  // mode must be one of the known values
  const validModes = ["ai", "online", "local", "story"] as const;
  if (!validModes.includes(obj.mode as any)) return null;

  // appVersion is optional for legacy replays
  if (obj.appVersion !== undefined && typeof obj.appVersion !== "string") return null;

  // difficulty is only used by story replays, but stays optional for legacy files
  const validDifficulties = ["easy", "normal", "hard", "lunatic"] as const;
  if (obj.difficulty !== undefined && !validDifficulties.includes(obj.difficulty as any)) return null;

  // player IDs
  if (!isNonEmptyString(obj.player1Id) || !isNonEmptyString(obj.player2Id)) return null;

  // finalGlobalInputHash: string or null
  if (obj.finalGlobalInputHash !== null && typeof obj.finalGlobalInputHash !== "string") return null;

  // loadouts must be a valid BattleLoadouts object
  if (!isObject(obj.loadouts)) return null;
  const loadouts = obj.loadouts as Record<string, unknown>;
  if (!isObject(loadouts.player) || !isObject(loadouts.target)) return null;

  const playerLoadout = loadouts.player as Record<string, unknown>;
  const targetLoadout = loadouts.target as Record<string, unknown>;
  if (!isNonEmptyString(playerLoadout.primaryCharacterId) || !isNonEmptyString(targetLoadout.primaryCharacterId)) return null;

  // alternateCharacterId is optional but must be a string if present
  if (playerLoadout.alternateCharacterId !== undefined && typeof playerLoadout.alternateCharacterId !== "string") return null;
  if (targetLoadout.alternateCharacterId !== undefined && typeof targetLoadout.alternateCharacterId !== "string") return null;

  // battles must be a non-empty array of valid battle records
  if (!Array.isArray(obj.battles) || obj.battles.length === 0) return null;
  if (!obj.battles.every(isValidReplayBattleRecord)) return null;

  return data as unknown as ReplayFile;
}
