import { PUBLIC_SERVER } from "@repo/constants";

export interface UiSettings {
  username: string;
  debug: boolean;
  serverAddress: string;
  music: number;
  sound: number;
}

const STORAGE_KEYS = {
  username: "fxtz_username",
  debug: "fxtz_debug",
  serverAddress: "fxtz_server_address",
  music: "fxtz_music",
  sound: "fxtz_sound",
} as const;

const DEFAULT_SERVER_ADDRESS = PUBLIC_SERVER[0]?.addr ?? "ws://localhost:22334";

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

function normalizeVolume(value: number, fallback = 100): number {
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return Math.max(0, Math.min(100, Math.round(value)));
}

export const uiSettings: UiSettings = {
  username: readString(STORAGE_KEYS.username, "Player"),
  debug: readBoolean(STORAGE_KEYS.debug, false),
  serverAddress: readString(STORAGE_KEYS.serverAddress, DEFAULT_SERVER_ADDRESS),
  music: readVolume(STORAGE_KEYS.music, 100),
  sound: readVolume(STORAGE_KEYS.sound, 100),
};

export function setUsername(username: string): void {
  uiSettings.username = username;
  writeString(STORAGE_KEYS.username, username);
}

export function setDebug(debug: boolean): void {
  uiSettings.debug = debug;
  writeBoolean(STORAGE_KEYS.debug, debug);
}

export function setServerAddress(serverAddress: string): void {
  uiSettings.serverAddress = serverAddress;
  writeString(STORAGE_KEYS.serverAddress, serverAddress);
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
