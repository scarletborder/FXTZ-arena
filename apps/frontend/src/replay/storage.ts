import { IS_DESKTOP_APP, REPLAY_FILE_PREFIX, REPLAY_TOTAL_SLOTS } from "@repo/constants";
import type { ReplayFile, ReplaySlotInfo } from "./types";
import { SLOTS_PER_PAGE } from "./types";

// ── Platform detection ──────────────────────────────────────────────────

const isDesktop = IS_DESKTOP_APP;
const GZIP_MIME_TYPE = "application/gzip";
const BIN_TYPE = "application/octet-stream";
const JSON_MIME_TYPE = "application/json";

// ── Key formatting ──────────────────────────────────────────────────────
// Slot index 0 → "fxtz_replay_01"
// Slot index 63 → "fxtz_replay_64"

function dataKey(slotIndex: number): string {
  return `${REPLAY_FILE_PREFIX}${String(slotIndex + 1).padStart(2, "0")}`;
}

function legacyMetaKey(slotIndex: number): string {
  return `${dataKey(slotIndex)}.json`;
}

// ── Browser: IndexedDB helpers ──────────────────────────────────────────

const DB_NAME = "fxtz_arena_replays";
const DB_VERSION = 1;
const DATA_STORE = "data";
const LEGACY_META_STORE = "meta";

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(DATA_STORE)) {
        db.createObjectStore(DATA_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

type StoredReplayData = string | ArrayBuffer | Uint8Array | number[];

async function idbSet(storeName: string, key: string, value: StoredReplayData): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    tx.objectStore(storeName).put(value, key);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

async function idbGet(storeName: string, key: string): Promise<StoredReplayData | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readonly");
    const req = tx.objectStore(storeName).get(key);
    req.onsuccess = () => { db.close(); resolve(req.result ?? null); };
    req.onerror = () => { db.close(); reject(req.error); };
  });
}

async function idbDelete(storeName: string, key: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    tx.objectStore(storeName).delete(key);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

async function idbDeleteIfStoreExists(storeName: string, key: string): Promise<void> {
  const db = await openDB();
  if (!db.objectStoreNames.contains(storeName)) {
    db.close();
    return;
  }
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    tx.objectStore(storeName).delete(key);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

/** Batch-get multiple keys in a single transaction. */
async function idbGetBatch(storeName: string, keys: string[]): Promise<(StoredReplayData | null)[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readonly");
    const store = tx.objectStore(storeName);
    const results: (StoredReplayData | null)[] = new Array(keys.length).fill(null);
    let completed = 0;
    let hasError = false;
    for (let i = 0; i < keys.length; i += 1) {
      const idx = i;
      const req = store.get(keys[i]);
      req.onsuccess = () => {
        results[idx] = req.result ?? null;
        completed += 1;
        if (completed === keys.length) {
          db.close();
          resolve(results);
        }
      };
      req.onerror = () => {
        if (!hasError) {
          hasError = true;
          db.close();
          reject(req.error);
        }
      };
    }
  });
}

// ── Desktop: Tauri invoke helpers ───────────────────────────────────────

interface TauriCoreApi {
  invoke<T>(command: string, args?: Record<string, unknown>): Promise<T>;
}

interface ReplaySlotData {
  data: StoredReplayData | null;
}

let tauriCore: TauriCoreApi | null = null;

async function ensureTauriCore(): Promise<TauriCoreApi> {
  if (!tauriCore) {
    tauriCore = await import("@tauri-apps/api/core") as TauriCoreApi;
  }
  return tauriCore;
}

/** Convert 0-based JS slot index to 1-based Rust slot index for file naming. */
function toRustSlot(slotIndex: number): number {
  return slotIndex + 1;
}

async function desktopSave(slotIndex: number, data: Uint8Array): Promise<void> {
  const core = await ensureTauriCore();
  await core.invoke("replay_save_slot", {
    slotIndex: toRustSlot(slotIndex),
    data: Array.from(data),
  });
}

async function desktopLoad(slotIndex: number): Promise<ReplaySlotData | null> {
  const core = await ensureTauriCore();
  return core.invoke<ReplaySlotData>("replay_load_slot", { slotIndex: toRustSlot(slotIndex) });
}

async function desktopDelete(slotIndex: number): Promise<void> {
  const core = await ensureTauriCore();
  await core.invoke("replay_delete_slot", { slotIndex: toRustSlot(slotIndex) });
}

async function desktopExport(slotIndex: number, data: Uint8Array): Promise<string | null> {
  const core = await ensureTauriCore();
  return core.invoke<string | null>("replay_export_slot", {
    slotIndex: toRustSlot(slotIndex),
    data: Array.from(data),
  });
}

// ── Internal helpers shared by both backends ────────────────────────────

function replayToMeta(slotIndex: number, replay: ReplayFile): ReplaySlotInfo {
  return {
    slotIndex,
    title: replay.title,
    timestamp: replay.timestamp,
    mode: replay.mode,
    battleCount: replay.battles.length,
    player1Id: replay.player1Id,
    player2Id: replay.player2Id,
  };
}

function parseReplayJson(raw: string): ReplayFile | null {
  try {
    return JSON.parse(raw) as ReplayFile;
  } catch {
    return null;
  }
}

async function gzipText(text: string): Promise<Uint8Array> {
  const stream = new Blob([text], { type: JSON_MIME_TYPE }).stream().pipeThrough(new CompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function bytesToArrayBuffer(data: Uint8Array): ArrayBuffer {
  return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
}

async function gunzipText(data: Uint8Array): Promise<string> {
  const stream = new Blob([bytesToArrayBuffer(data)], { type: GZIP_MIME_TYPE }).stream().pipeThrough(new DecompressionStream("gzip"));
  return new Response(stream).text();
}

function storedDataToBytes(raw: StoredReplayData): Uint8Array | null {
  if (raw instanceof Uint8Array) return raw;
  if (raw instanceof ArrayBuffer) return new Uint8Array(raw);
  if (Array.isArray(raw)) return new Uint8Array(raw);
  return null;
}

function isGzipBytes(data: Uint8Array): boolean {
  return data.length >= 2 && data[0] === 0x1f && data[1] === 0x8b;
}

async function storedDataToJson(raw: StoredReplayData): Promise<string | null> {
  if (typeof raw === "string") return raw;
  const bytes = storedDataToBytes(raw);
  if (!bytes) return null;
  if (isGzipBytes(bytes)) {
    return gunzipText(bytes);
  }
  return new TextDecoder().decode(bytes);
}

async function parseReplayData(raw: StoredReplayData | null): Promise<ReplayFile | null> {
  if (!raw) return null;
  const json = await storedDataToJson(raw);
  return json ? parseReplayJson(json) : null;
}

async function rawReplayToSlotInfo(slotIndex: number, raw: StoredReplayData | null): Promise<ReplaySlotInfo | null> {
  const replay = await parseReplayData(raw);
  return replay ? replayToMeta(slotIndex, replay) : null;
}

// ── Public API ───────────────────────────────────────────────────────────

export async function saveReplay(slotIndex: number, replay: ReplayFile): Promise<void> {
  const data = await gzipText(JSON.stringify(replay));

  if (isDesktop) {
    await desktopSave(slotIndex, data);
  } else {
    await idbSet(DATA_STORE, dataKey(slotIndex), data);
    await idbDeleteIfStoreExists(LEGACY_META_STORE, legacyMetaKey(slotIndex));
  }
}

export async function loadReplay(slotIndex: number): Promise<ReplayFile | null> {
  let raw: StoredReplayData | null;

  if (isDesktop) {
    const result = await desktopLoad(slotIndex);
    raw = result?.data ?? null;
  } else {
    raw = await idbGet(DATA_STORE, dataKey(slotIndex));
  }

  return parseReplayData(raw);
}

export async function deleteReplay(slotIndex: number): Promise<void> {
  if (isDesktop) {
    await desktopDelete(slotIndex);
  } else {
    await idbDelete(DATA_STORE, dataKey(slotIndex));
    await idbDeleteIfStoreExists(LEGACY_META_STORE, legacyMetaKey(slotIndex));
  }
}

export async function getSlotInfo(slotIndex: number): Promise<ReplaySlotInfo | null> {
  const replay = await loadReplay(slotIndex);
  return replay ? replayToMeta(slotIndex, replay) : null;
}

export async function listSlots(): Promise<ReplaySlotInfo[]> {
  const slots: ReplaySlotInfo[] = [];
  for (let i = 0; i < REPLAY_TOTAL_SLOTS; i += 1) {
    const info = await getSlotInfo(i);
    if (info) slots.push(info);
  }
  return slots;
}

export async function listSlotsForPage(page: number): Promise<(ReplaySlotInfo | null)[]> {
  const start = page * SLOTS_PER_PAGE;
  const end = Math.min(start + SLOTS_PER_PAGE, REPLAY_TOTAL_SLOTS);

  if (isDesktop) {
    const result: (ReplaySlotInfo | null)[] = [];
    for (let i = start; i < end; i += 1) {
      const slot = await desktopLoad(i);
      result.push(await rawReplayToSlotInfo(i, slot?.data ?? null));
    }
    return result;
  }

  // Batch read all data keys for this page in one transaction.
  const keys: string[] = [];
  for (let i = start; i < end; i += 1) {
    keys.push(dataKey(i));
  }
  const raws = await idbGetBatch(DATA_STORE, keys);
  return Promise.all(raws.map((raw, offset) => rawReplayToSlotInfo(start + offset, raw)));
}

export function getPageCount(): number {
  return Math.ceil(REPLAY_TOTAL_SLOTS / SLOTS_PER_PAGE);
}

export async function exportReplayAsJson(slotIndex: number): Promise<string | null> {
  const replay = await loadReplay(slotIndex);
  if (!replay) return null;
  return JSON.stringify(replay, null, 2);
}

export async function exportReplayAsGzip(slotIndex: number): Promise<Uint8Array | null> {
  const replay = await loadReplay(slotIndex);
  if (!replay) return null;
  return gzipText(JSON.stringify(replay));
}

export async function downloadReplay(slotIndex: number): Promise<void> {
  const gzip = await exportReplayAsGzip(slotIndex);
  if (!gzip) return;
  const blob = new Blob([bytesToArrayBuffer(gzip)], { type: BIN_TYPE });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${dataKey(slotIndex)}`;
  document.body.appendChild(a);
  debugger;
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export async function replayFileToJson(file: File): Promise<unknown> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const text = isGzipBytes(bytes) ? await gunzipText(bytes) : new TextDecoder().decode(bytes);
  return JSON.parse(text);
}

export async function desktopSaveAs(slotIndex: number): Promise<string | null> {
  if (!isDesktop) return null;
  const gzip = await exportReplayAsGzip(slotIndex);
  if (!gzip) return null;
  return desktopExport(slotIndex, gzip);
}

/** Open the replay storage folder in the system file explorer (desktop only). */
export async function desktopOpenReplayFolder(): Promise<void> {
  if (!isDesktop) return;
  const core = await ensureTauriCore();
  await core.invoke("replay_open_folder");
}

export function formatSlotTime(timestamp: number): string {
  const d = new Date(timestamp);
  const y = d.getFullYear();
  const mo = d.getMonth() + 1;
  const day = d.getDate();
  const h = d.getHours();
  const min = d.getMinutes();
  return `${y}年${mo}月${day}日${h}时${min}分`;
}

export async function hasSlot(slotIndex: number): Promise<boolean> {
  return (await getSlotInfo(slotIndex)) !== null;
}

/** Format a battle duration from frame count at 60 fps. */
export function formatBattleDuration(frameCount: number): string {
  const seconds = Math.round(frameCount / 60);
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}m${s}s` : `${s}s`;
}
