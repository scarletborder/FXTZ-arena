import { MAX_PLAYER_NAME_LENGTH, PUBLIC_SERVER } from "@repo/constants";

export interface UiSettings {
  username: string;
  debug: boolean;
  logPath: string;
  serverAddress: string;
  p2pEnabled: boolean;
  stunServer: string;
  stunServers: string[];
  music: number;
  sound: number;
  selfAuthed: boolean;
}

const STORAGE_KEYS = {
  username: "fxtz_username",
  debug: "fxtz_debug",
  logPath: "fxtz_log_path",
  serverAddress: "fxtz_server_address",
  p2pEnabled: "fxtz_p2p_enabled",
  stunServer: "fxtz_stun_server",
  stunServers: "fxtz_stun_servers",
  music: "fxtz_music",
  sound: "fxtz_sound",
  selfAuthed: "selfAuthed",
} as const;

const DEFAULT_SERVER_ADDRESS = PUBLIC_SERVER[0]?.addr ?? "ws://localhost:22334";
const DEFAULT_STUN_SERVER = "stun:stun.miwifi.com";

function canUseLocalStorage(): boolean {
  return typeof localStorage !== "undefined";
}

function readString(key: string, fallback: string): string {
  if (!canUseLocalStorage()) {
    return fallback;
  }
  return localStorage.getItem(key) ?? fallback;
}

function readBoolean(key: string, fallback: boolean): boolean {
  if (!canUseLocalStorage()) {
    return fallback;
  }
  const raw = localStorage.getItem(key);
  if (raw === null) {
    return fallback;
  }
  return raw === "1" || raw === "true";
}

function readVolume(key: string, fallback: number): number {
  if (!canUseLocalStorage()) {
    return fallback;
  }
  const raw = localStorage.getItem(key);
  if (raw === null) {
    return fallback;
  }
  return normalizeVolume(Number(raw), fallback);
}

function readStringArray(key: string, fallback: string[]): string[] {
  if (!canUseLocalStorage()) {
    return fallback;
  }
  const raw = localStorage.getItem(key);
  if (!raw) {
    return fallback;
  }
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((value): value is string => typeof value === "string")
      : fallback;
  } catch {
    return fallback;
  }
}

function writeString(key: string, value: string): void {
  if (canUseLocalStorage()) {
    localStorage.setItem(key, value);
  }
}

function writeBoolean(key: string, value: boolean): void {
  if (canUseLocalStorage()) {
    localStorage.setItem(key, value ? "1" : "0");
  }
}

function writeVolume(key: string, value: number): void {
  if (canUseLocalStorage()) {
    localStorage.setItem(key, String(normalizeVolume(value)));
  }
}

function writeStringArray(key: string, value: readonly string[]): void {
  if (canUseLocalStorage()) {
    localStorage.setItem(key, JSON.stringify(value));
  }
}

function normalizeVolume(value: number, fallback = 100): number {
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return Math.max(0, Math.min(100, Math.round(value)));
}

export const uiSettings: UiSettings = {
  username: normalizeUsername(readString(STORAGE_KEYS.username, "Player")),
  debug: readBoolean(STORAGE_KEYS.debug, false),
  logPath: readString(STORAGE_KEYS.logPath, "D:/"),
  serverAddress: readString(STORAGE_KEYS.serverAddress, DEFAULT_SERVER_ADDRESS),
  p2pEnabled: readBoolean(STORAGE_KEYS.p2pEnabled, false),
  stunServer: "",
  stunServers: [],
  music: readVolume(STORAGE_KEYS.music, 60),
  sound: readVolume(STORAGE_KEYS.sound, 60),
  selfAuthed: readBoolean(STORAGE_KEYS.selfAuthed, false),
};
uiSettings.stunServers = normalizeStunServers(readStringArray(STORAGE_KEYS.stunServers, [DEFAULT_STUN_SERVER]));
uiSettings.stunServer = normalizeStunServer(readString(STORAGE_KEYS.stunServer, uiSettings.stunServers[0] ?? DEFAULT_STUN_SERVER));
if (!uiSettings.stunServers.includes(uiSettings.stunServer)) {
  uiSettings.stunServers = normalizeStunServers([uiSettings.stunServer, ...uiSettings.stunServers]);
}

export function setUsername(username: string): void {
  const normalized = normalizeUsername(username);
  uiSettings.username = normalized;
  writeString(STORAGE_KEYS.username, normalized);
}

export function setDebug(debug: boolean): void {
  uiSettings.debug = debug;
  writeBoolean(STORAGE_KEYS.debug, debug);
}

export function setLogPath(logPath: string): void {
  uiSettings.logPath = logPath;
  writeString(STORAGE_KEYS.logPath, logPath);
}

export function setServerAddress(serverAddress: string): void {
  uiSettings.serverAddress = serverAddress;
  writeString(STORAGE_KEYS.serverAddress, serverAddress);
}

export function setP2pEnabled(enabled: boolean): void {
  uiSettings.p2pEnabled = enabled;
  writeBoolean(STORAGE_KEYS.p2pEnabled, enabled);
}

export function setStunServer(stunServer: string): void {
  const normalized = normalizeStunServer(stunServer);
  uiSettings.stunServer = normalized;
  if (!uiSettings.stunServers.includes(normalized)) {
    setStunServers([normalized, ...uiSettings.stunServers]);
  }
  writeString(STORAGE_KEYS.stunServer, normalized);
}

export function setStunServers(stunServers: readonly string[]): void {
  uiSettings.stunServers = normalizeStunServers(stunServers);
  if (!uiSettings.stunServers.includes(uiSettings.stunServer)) {
    uiSettings.stunServer = uiSettings.stunServers[0] ?? DEFAULT_STUN_SERVER;
    writeString(STORAGE_KEYS.stunServer, uiSettings.stunServer);
  }
  writeStringArray(STORAGE_KEYS.stunServers, uiSettings.stunServers);
}

export function setMusicVolume(volume: number): void {
  const normalized = normalizeVolume(volume);
  uiSettings.music = normalized;
  writeVolume(STORAGE_KEYS.music, normalized);
}

export function setSoundVolume(volume: number): void {
  const normalized = normalizeVolume(volume);
  uiSettings.sound = normalized;
  writeVolume(STORAGE_KEYS.sound, normalized);
}

export function setSelfAuthed(selfAuthed: boolean): void {
  uiSettings.selfAuthed = selfAuthed;
  writeBoolean(STORAGE_KEYS.selfAuthed, selfAuthed);
}

function normalizeUsername(username: string): string {
  const trimmed = username.trim();
  return Array.from(trimmed || "Player").slice(0, MAX_PLAYER_NAME_LENGTH).join("");
}

function normalizeStunServer(server: string): string {
  const trimmed = server.trim() || DEFAULT_STUN_SERVER;
  return trimmed.startsWith("stun:") || trimmed.startsWith("stuns:") ? trimmed : `stun:${trimmed}`;
}

function normalizeStunServers(servers: readonly string[]): string[] {
  return Array.from(new Set([DEFAULT_STUN_SERVER, ...servers.map(normalizeStunServer)]));
}
