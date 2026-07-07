import { IS_DESKTOP_APP } from "@repo/constants";
import { normalizeJoystickSettings, type JoystickSettings } from "../battle/input-controller/gamepad";
import { DEFAULT_KEYBINDS, type KeybindSettings } from "../battle/input-controller/pc";
import {
  DEFAULT_VIRTUAL_JOY_SETTINGS,
  normalizeVirtualJoySettings,
  type VirtualJoySettings,
} from "../battle/input-controller/virtual-joy-settings";

export interface LocalInputProfile {
  readonly id: string;
  readonly version: 1;
  readonly username: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly keybinds: KeybindSettings;
  readonly joystick: JoystickSettings;
  readonly virtualJoy: VirtualJoySettings;
  readonly hash: string;
}

export type ProfileInputPatch = Partial<Pick<LocalInputProfile, "username" | "keybinds" | "joystick" | "virtualJoy">>;

const DB_NAME = "fxtz_arena_profiles";
const DB_VERSION = 1;
const STORE_NAME = "profiles";
const DEFAULT_PROFILE_ID = "default";
const PROFILE_FILE_VERSION = 1;
const isDesktop = IS_DESKTOP_APP;

let dbPromise: Promise<IDBDatabase | undefined> | undefined;
let initialized = false;
let profileCache: LocalInputProfile[] = [];

interface TauriCoreApi {
  invoke<T>(command: string, args?: Record<string, unknown>): Promise<T>;
}

interface DesktopProfileFileData {
  readonly data: string;
}

let tauriCore: TauriCoreApi | null = null;

async function ensureTauriCore(): Promise<TauriCoreApi> {
  if (!tauriCore) {
    tauriCore = await import("@tauri-apps/api/core") as TauriCoreApi;
  }
  return tauriCore;
}

export async function initializeProfileRepository(): Promise<void> {
  if (initialized) {
    return;
  }
  if (isDesktop) {
    profileCache = await readDesktopProfiles();
    const db = await openProfilesDb();
    if (db) {
      const idbProfiles = await readAllProfiles(db);
      await Promise.all(idbProfiles.map((profile) => persistDesktopProfile(profile)));
      profileCache = [...profileCache, ...idbProfiles];
    }
    if (!profileCache.some((profile) => profile.id === DEFAULT_PROFILE_ID)) {
      const migrated = await createDefaultProfileFromLegacy();
      await persistDesktopProfile(migrated);
      profileCache = [migrated, ...profileCache];
    }
    profileCache = sortProfiles(deduplicateProfiles(profileCache));
    initialized = true;
    return;
  }
  const db = await openProfilesDb();
  if (db) {
    profileCache = await readAllProfiles(db);
    if (!profileCache.some((profile) => profile.id === DEFAULT_PROFILE_ID)) {
      const migrated = await createDefaultProfileFromLegacy();
      await putProfile(db, migrated);
      profileCache = [migrated, ...profileCache];
    }
  } else {
    profileCache = [await createDefaultProfileFromLegacy()];
  }
  profileCache = sortProfiles(deduplicateProfiles(profileCache));
  initialized = true;
}

export function listProfiles(): readonly LocalInputProfile[] {
  return profileCache;
}

export function getProfile(profileId: string | undefined): LocalInputProfile {
  return profileCache.find((profile) => profile.id === profileId)
    ?? profileCache.find((profile) => profile.id === DEFAULT_PROFILE_ID)
    ?? profileCache[0]
    ?? fallbackDefaultProfile();
}

export async function createProfile(username = "default"): Promise<LocalInputProfile> {
  await initializeProfileRepository();
  const now = new Date().toISOString();
  const profile = await withComputedHash({
    id: createProfileId(),
    version: PROFILE_FILE_VERSION,
    username: normalizeProfileUsername(username),
    createdAt: now,
    updatedAt: now,
    keybinds: { ...DEFAULT_KEYBINDS },
    joystick: normalizeJoystickSettings(undefined),
    virtualJoy: { ...DEFAULT_VIRTUAL_JOY_SETTINGS },
  });
  await persistProfile(profile);
  profileCache = sortProfiles([...profileCache, profile]);
  return profile;
}

export async function saveProfile(profileId: string, patch: ProfileInputPatch): Promise<LocalInputProfile> {
  await initializeProfileRepository();
  const current = getProfile(profileId);
  const normalizedPatch = {
    username: normalizeProfileUsername(patch.username ?? current.username),
    keybinds: patch.keybinds ? { ...DEFAULT_KEYBINDS, ...patch.keybinds } : current.keybinds,
    joystick: patch.joystick ? normalizeJoystickSettings(patch.joystick) : current.joystick,
    virtualJoy: patch.virtualJoy ? normalizeVirtualJoySettings(patch.virtualJoy) : current.virtualJoy,
  } satisfies Pick<LocalInputProfile, "username" | "keybinds" | "joystick" | "virtualJoy">;

  if (
    normalizedPatch.username === current.username
    && stableStringify(normalizedPatch.keybinds) === stableStringify(current.keybinds)
    && stableStringify(normalizedPatch.joystick) === stableStringify(current.joystick)
    && stableStringify(normalizedPatch.virtualJoy) === stableStringify(current.virtualJoy)
  ) {
    return current;
  }

  const next = await withComputedHash({
    ...current,
    ...normalizedPatch,
    updatedAt: new Date().toISOString(),
  });
  await persistProfile(next);
  profileCache = sortProfiles(profileCache.map((profile) => profile.id === next.id ? next : profile));
  return next;
}

export async function deleteProfile(profileId: string): Promise<void> {
  await initializeProfileRepository();
  if (profileId === DEFAULT_PROFILE_ID || profileCache.length <= 1) {
    return;
  }
  if (isDesktop) {
    await deleteDesktopProfile(profileId);
  } else {
    const db = await openProfilesDb();
    if (db) {
    await deleteProfileFromDb(db, profileId);
    }
  }
  profileCache = profileCache.filter((profile) => profile.id !== profileId);
}

export function serializeProfile(profile: LocalInputProfile): string {
  return `${stableStringify(profile)}\n`;
}

export async function parseImportedProfile(text: string): Promise<LocalInputProfile> {
  const parsed = JSON.parse(text) as Partial<LocalInputProfile>;
  const profile = normalizeImportedProfile(parsed);
  const expectedHash = await computeProfileHash(profile);
  if (profile.hash !== expectedHash) {
    throw new Error("Profile hash mismatch.");
  }
  return profile;
}

export async function importProfile(profile: LocalInputProfile): Promise<LocalInputProfile> {
  await initializeProfileRepository();
  const next = profileCache.some((item) => item.id === profile.id)
    ? { ...profile, id: createProfileId() }
    : profile;
  const normalized = await withComputedHash({
    ...next,
    username: normalizeProfileUsername(next.username),
    keybinds: { ...DEFAULT_KEYBINDS, ...next.keybinds },
    joystick: normalizeJoystickSettings(next.joystick),
    virtualJoy: normalizeVirtualJoySettings(next.virtualJoy),
  });
  await persistProfile(normalized);
  profileCache = sortProfiles([...profileCache, normalized]);
  return normalized;
}

export function shortProfileHash(profile: Pick<LocalInputProfile, "hash">): string {
  return profile.hash.slice(0, 10);
}

async function openProfilesDb(): Promise<IDBDatabase | undefined> {
  if (typeof indexedDB === "undefined") {
    return undefined;
  }
  dbPromise ??= new Promise((resolve) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      console.warn("Failed to open profile database:", request.error);
      resolve(undefined);
    };
  });
  return dbPromise;
}

function readAllProfiles(db: IDBDatabase): Promise<LocalInputProfile[]> {
  return new Promise((resolve) => {
    const transaction = db.transaction(STORE_NAME, "readonly");
    const request = transaction.objectStore(STORE_NAME).getAll();
    request.onsuccess = () => {
      const profiles = Array.isArray(request.result)
        ? request.result.map((value) => normalizeImportedProfile(value)).filter(Boolean)
        : [];
      resolve(profiles);
    };
    request.onerror = () => resolve([]);
  });
}

function putProfile(db: IDBDatabase, profile: LocalInputProfile): Promise<void> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    const request = transaction.objectStore(STORE_NAME).put(profile);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

async function persistProfile(profile: LocalInputProfile): Promise<void> {
  if (isDesktop) {
    await persistDesktopProfile(profile);
    return;
  }
  const db = await openProfilesDb();
  if (db) {
    await putProfile(db, profile);
  }
}

async function readDesktopProfiles(): Promise<LocalInputProfile[]> {
  const core = await ensureTauriCore();
  const files = await core.invoke<DesktopProfileFileData[]>("profile_list_files");
  const profiles: LocalInputProfile[] = [];
  for (const file of files) {
    try {
      profiles.push(await parseImportedProfile(file.data));
    } catch (error) {
      console.warn("Skipping invalid desktop profile file:", error);
    }
  }
  return profiles;
}

async function persistDesktopProfile(profile: LocalInputProfile): Promise<void> {
  const core = await ensureTauriCore();
  await core.invoke("profile_save_file", {
    profileId: profile.id,
    data: serializeProfile(profile),
  });
}

async function deleteDesktopProfile(profileId: string): Promise<void> {
  const core = await ensureTauriCore();
  await core.invoke("profile_delete_file", { profileId });
}

function deleteProfileFromDb(db: IDBDatabase, profileId: string): Promise<void> {
  return new Promise((resolve) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    const request = transaction.objectStore(STORE_NAME).delete(profileId);
    request.onsuccess = () => resolve();
    request.onerror = () => resolve();
  });
}

async function createDefaultProfileFromLegacy(): Promise<LocalInputProfile> {
  const now = new Date().toISOString();
  const account = readJsonRecord("fxtz_account");
  const username = typeof account?.p1Username === "string"
    ? account.p1Username
    : readString("fxtz_username", "default");
  return withComputedHash({
    id: DEFAULT_PROFILE_ID,
    version: PROFILE_FILE_VERSION,
    username: normalizeProfileUsername(username, "default"),
    createdAt: now,
    updatedAt: now,
    keybinds: readKeybinds(),
    joystick: readJoystickSettings(),
    virtualJoy: readVirtualJoySettings(),
  });
}

function fallbackDefaultProfile(): LocalInputProfile {
  const now = new Date().toISOString();
  return {
    id: DEFAULT_PROFILE_ID,
    version: PROFILE_FILE_VERSION,
    username: "default",
    createdAt: now,
    updatedAt: now,
    keybinds: { ...DEFAULT_KEYBINDS },
    joystick: normalizeJoystickSettings(undefined),
    virtualJoy: { ...DEFAULT_VIRTUAL_JOY_SETTINGS },
    hash: "",
  };
}

async function withComputedHash(profile: Omit<LocalInputProfile, "hash"> | LocalInputProfile): Promise<LocalInputProfile> {
  const { hash: _hash, updatedAt: _updatedAt, ...withoutHash } = profile as LocalInputProfile;
  void _hash;
  void _updatedAt;
  const hash = await computeProfileHash(withoutHash);
  return { ...(profile as Omit<LocalInputProfile, "hash">), hash };
}

async function computeProfileHash(profile: Partial<LocalInputProfile> & Omit<LocalInputProfile, "hash" | "updatedAt">): Promise<string> {
  const { hash: _hash, updatedAt: _updatedAt, ...withoutHash } = profile;
  void _hash;
  void _updatedAt;
  const source = stableStringify(withoutHash);
  if (globalThis.crypto?.subtle) {
    const bytes = new TextEncoder().encode(source);
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  }
  return fallbackHash(source);
}

function normalizeImportedProfile(value: Partial<LocalInputProfile>): LocalInputProfile {
  if (!value || typeof value !== "object") {
    throw new Error("Invalid profile file.");
  }
  return {
    id: typeof value.id === "string" && value.id.trim() ? value.id : createProfileId(),
    version: PROFILE_FILE_VERSION,
    username: normalizeProfileUsername(value.username),
    createdAt: typeof value.createdAt === "string" ? value.createdAt : new Date().toISOString(),
    updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : new Date().toISOString(),
    keybinds: { ...DEFAULT_KEYBINDS, ...(value.keybinds ?? {}) },
    joystick: normalizeJoystickSettings(value.joystick),
    virtualJoy: normalizeVirtualJoySettings(value.virtualJoy),
    hash: typeof value.hash === "string" ? value.hash : "",
  };
}

function readKeybinds(): KeybindSettings {
  return { ...DEFAULT_KEYBINDS, ...readJsonRecord("fxtz_keybinds") };
}

function readJoystickSettings(): JoystickSettings {
  return normalizeJoystickSettings(readJsonRecord("fxtz_joystick"));
}

function readVirtualJoySettings(): VirtualJoySettings {
  return normalizeVirtualJoySettings(readJsonRecord("fxtz_virtual_joy") ?? DEFAULT_VIRTUAL_JOY_SETTINGS);
}

function readJsonRecord(key: string): Record<string, unknown> | undefined {
  if (typeof localStorage === "undefined") {
    return undefined;
  }
  const raw = localStorage.getItem(key);
  if (!raw) {
    return undefined;
  }
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : undefined;
  } catch {
    return undefined;
  }
}

function readString(key: string, fallback: string): string {
  if (typeof localStorage === "undefined") {
    return fallback;
  }
  return localStorage.getItem(key) ?? fallback;
}

function normalizeProfileUsername(username: string | undefined, fallback = "default"): string {
  const trimmed = (username ?? "").trim();
  return trimmed || fallback;
}

function createProfileId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `profile-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function sortProfiles(profiles: readonly LocalInputProfile[]): LocalInputProfile[] {
  return [...profiles].sort((a, b) => {
    if (a.id === DEFAULT_PROFILE_ID) return -1;
    if (b.id === DEFAULT_PROFILE_ID) return 1;
    return a.createdAt.localeCompare(b.createdAt);
  });
}

function deduplicateProfiles(profiles: readonly LocalInputProfile[]): LocalInputProfile[] {
  const byId = new Map<string, LocalInputProfile>();
  for (const profile of profiles) {
    const current = byId.get(profile.id);
    if (!current || profile.updatedAt.localeCompare(current.updatedAt) > 0) {
      byId.set(profile.id, profile);
    }
  }
  return Array.from(byId.values());
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(",")}}`;
}

function fallbackHash(source: string): string {
  let hash = 2166136261;
  for (let i = 0; i < source.length; i += 1) {
    hash ^= source.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(64, "0");
}
