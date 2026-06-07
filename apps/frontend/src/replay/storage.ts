import { IS_DESKTOP_APP } from "@repo/constants";
import type { ReplayFile, ReplaySlotInfo } from "./types";
import { SLOTS_PER_PAGE, TOTAL_SLOTS } from "./types";

// ── Platform detection ──────────────────────────────────────────────────

const isDesktop = IS_DESKTOP_APP;

// ── Key formatting ──────────────────────────────────────────────────────
// Slot index 0 → "fxtz_replay_01" (data) / "fxtz_replay_01.json" (meta)
// Slot index 63 → "fxtz_replay_64" (data) / "fxtz_replay_64.json" (meta)

function dataKey(slotIndex: number): string {
  return `fxtz_replay_${String(slotIndex + 1).padStart(2, "0")}`;
}

function metaKey(slotIndex: number): string {
  return `${dataKey(slotIndex)}.json`;
}

// ── Browser: IndexedDB helpers ──────────────────────────────────────────

const DB_NAME = "fxtz_arena_replays";
const DB_VERSION = 1;
const DATA_STORE = "data";
const META_STORE = "meta";

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(DATA_STORE)) {
        db.createObjectStore(DATA_STORE);
      }
      if (!db.objectStoreNames.contains(META_STORE)) {
        db.createObjectStore(META_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function idbSet(storeName: string, key: string, value: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    tx.objectStore(storeName).put(value, key);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

async function idbGet(storeName: string, key: string): Promise<string | null> {
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

async function idbGetAll(storeName: string): Promise<Map<string, string>> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readonly");
    const req = tx.objectStore(storeName).openCursor();
    const map = new Map<string, string>();
    req.onsuccess = () => {
      const cursor = req.result;
      if (cursor) {
        map.set(cursor.key as string, cursor.value as string);
        cursor.continue();
      } else {
        db.close();
        resolve(map);
      }
    };
    req.onerror = () => { db.close(); reject(req.error); };
  });
}

/** Batch-get multiple keys in a single transaction. */
async function idbGetBatch(storeName: string, keys: string[]): Promise<(string | null)[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readonly");
    const store = tx.objectStore(storeName);
    const results: (string | null)[] = new Array(keys.length).fill(null);
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
  data: string | null;
  meta: string | null;
}

interface ReplaySlotEntry {
  slot_index: number;
  meta: string;
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

async function desktopSave(slotIndex: number, data: string, meta: string): Promise<void> {
  const core = await ensureTauriCore();
  await core.invoke("replay_save_slot", {
    slotIndex: toRustSlot(slotIndex),
    data,
    meta,
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

async function desktopList(): Promise<Map<number, string>> {
  const core = await ensureTauriCore();
  const entries = await core.invoke<ReplaySlotEntry[]>("replay_list_slots");
  const map = new Map<number, string>();
  for (const e of entries) {
    map.set(e.slot_index, e.meta);
  }
  return map;
}

async function desktopExport(slotIndex: number): Promise<string | null> {
  const core = await ensureTauriCore();
  return core.invoke<string | null>("replay_export_slot", { slotIndex: toRustSlot(slotIndex) });
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

function parseMeta(raw: string): ReplaySlotInfo | null {
  try {
    return JSON.parse(raw) as ReplaySlotInfo;
  } catch {
    return null;
  }
}

// ── Public API ───────────────────────────────────────────────────────────

export async function saveReplay(slotIndex: number, replay: ReplayFile): Promise<void> {
  const data = JSON.stringify(replay);
  const meta = JSON.stringify(replayToMeta(slotIndex, replay));

  if (isDesktop) {
    await desktopSave(slotIndex, data, meta);
  } else {
    await idbSet(DATA_STORE, dataKey(slotIndex), data);
    await idbSet(META_STORE, metaKey(slotIndex), meta);
  }
}

export async function loadReplay(slotIndex: number): Promise<ReplayFile | null> {
  let raw: string | null;

  if (isDesktop) {
    const result = await desktopLoad(slotIndex);
    raw = result?.data ?? null;
  } else {
    raw = await idbGet(DATA_STORE, dataKey(slotIndex));
  }

  if (!raw) return null;
  try {
    return JSON.parse(raw) as ReplayFile;
  } catch {
    return null;
  }
}

export async function deleteReplay(slotIndex: number): Promise<void> {
  if (isDesktop) {
    await desktopDelete(slotIndex);
  } else {
    await idbDelete(DATA_STORE, dataKey(slotIndex));
    await idbDelete(META_STORE, metaKey(slotIndex));
  }
}

export async function getSlotInfo(slotIndex: number): Promise<ReplaySlotInfo | null> {
  let raw: string | null;

  if (isDesktop) {
    const result = await desktopLoad(slotIndex);
    raw = result?.meta ?? null;
  } else {
    raw = await idbGet(META_STORE, metaKey(slotIndex));
  }

  if (!raw) return null;
  return parseMeta(raw);
}

export async function listSlots(): Promise<ReplaySlotInfo[]> {
  if (isDesktop) {
    const map = await desktopList();
    const slots: ReplaySlotInfo[] = [];
    for (const [, metaRaw] of map) {
      const info = parseMeta(metaRaw);
      if (info) slots.push(info);
    }
    return slots;
  }

  // Browser: iterate all meta store entries
  const map = await idbGetAll(META_STORE);
  const slots: ReplaySlotInfo[] = [];
  for (const [, raw] of map) {
    const info = parseMeta(raw);
    if (info) slots.push(info);
  }
  return slots;
}

export async function listSlotsForPage(page: number): Promise<(ReplaySlotInfo | null)[]> {
  const start = page * SLOTS_PER_PAGE;
  const end = Math.min(start + SLOTS_PER_PAGE, TOTAL_SLOTS);

  if (isDesktop) {
    const map = await desktopList();
    const result: (ReplaySlotInfo | null)[] = [];
    for (let i = start; i < end; i += 1) {
      const metaRaw = map.get(i + 1); // slot_index is 1-based in the file system
      result.push(metaRaw ? parseMeta(metaRaw) : null);
    }
    return result;
  }

  // Batch read all meta keys for this page in one transaction
  const keys: string[] = [];
  for (let i = start; i < end; i += 1) {
    keys.push(metaKey(i));
  }
  const raws = await idbGetBatch(META_STORE, keys);
  return raws.map((raw) => (raw ? parseMeta(raw) : null));
}

export function getPageCount(): number {
  return Math.ceil(TOTAL_SLOTS / SLOTS_PER_PAGE);
}

export async function exportReplayAsJson(slotIndex: number): Promise<string | null> {
  const replay = await loadReplay(slotIndex);
  if (!replay) return null;
  return JSON.stringify(replay, null, 2);
}

export async function downloadReplay(slotIndex: number): Promise<void> {
  const json = await exportReplayAsJson(slotIndex);
  if (!json) return;
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const replay = await loadReplay(slotIndex);
  a.download = `replay_${replay?.title ?? slotIndex}_${slotIndex}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export async function desktopSaveAs(slotIndex: number): Promise<string | null> {
  if (!isDesktop) return null;
  return desktopExport(slotIndex);
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
