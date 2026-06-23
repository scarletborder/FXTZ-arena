import { MAX_PLAYER_NAME_LENGTH, PUBLIC_SERVER } from "@repo/constants";
import { AccountSettings, DEFAULT_ACCOUNT_SETTINGS, DEFAULT_JOYSTICK_SETTINGS, JoystickSettings } from "../battle/input-controller/gamepad";
import { DEFAULT_KEYBINDS, KeybindSettings } from "../battle/input-controller/pc";

export interface UiSettings {
  readonly username: string;
  debug: boolean;
  logPath: string;
  serverAddress: string;
  p2pEnabled: boolean;
  stunServer: string;
  stunServers: string[];
  music: number;
  sound: number;
  battleHoverResources: boolean;
  selfAuthed: boolean;
  keybinds: KeybindSettings; // 键位设定
  account: AccountSettings;
  joystick: JoystickSettings;
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
  battleHoverResources: "fxtz_battle_hover_resources",
  selfAuthed: "selfAuthed",
  account: "fxtz_account",
  joystick: "fxtz_joystick",
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

function readKeybinds(): KeybindSettings {
  if (!canUseLocalStorage()) {
    return { ...DEFAULT_KEYBINDS };
  }
  const raw = localStorage.getItem("fxtz_keybinds");
  if (!raw) {
    return { ...DEFAULT_KEYBINDS };
  }
  try {
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_KEYBINDS, ...parsed };
  } catch {
    return { ...DEFAULT_KEYBINDS };
  }
}

function readJoystickSettings(): JoystickSettings {
  if (!canUseLocalStorage()) {
    return { ...DEFAULT_JOYSTICK_SETTINGS };
  }
  const raw = localStorage.getItem(STORAGE_KEYS.joystick);
  if (!raw) {
    return { ...DEFAULT_JOYSTICK_SETTINGS };
  }
  try {
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_JOYSTICK_SETTINGS, ...parsed };
  } catch {
    return { ...DEFAULT_JOYSTICK_SETTINGS };
  }
}

function readAccountSettings(): AccountSettings {
  const legacyUsername = normalizeUsername(readString(STORAGE_KEYS.username, DEFAULT_ACCOUNT_SETTINGS.p1Username));
  if (!canUseLocalStorage()) {
    return { ...DEFAULT_ACCOUNT_SETTINGS, p1Username: legacyUsername };
  }
  const raw = localStorage.getItem(STORAGE_KEYS.account);
  if (!raw) {
    return { ...DEFAULT_ACCOUNT_SETTINGS, p1Username: legacyUsername };
  }
  try {
    const parsed = JSON.parse(raw);
    return normalizeAccountSettings({ ...DEFAULT_ACCOUNT_SETTINGS, p1Username: legacyUsername, ...parsed });
  } catch {
    return { ...DEFAULT_ACCOUNT_SETTINGS, p1Username: legacyUsername };
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

function writeKeybinds(value: KeybindSettings): void {
  if (canUseLocalStorage()) {
    localStorage.setItem("fxtz_keybinds", JSON.stringify(value));
  }
}

function writeJoystickSettings(value: JoystickSettings): void {
  if (canUseLocalStorage()) {
    localStorage.setItem(STORAGE_KEYS.joystick, JSON.stringify(value));
  }
}

function writeAccountSettings(value: AccountSettings): void {
  if (canUseLocalStorage()) {
    localStorage.setItem(STORAGE_KEYS.account, JSON.stringify(value));
  }
}

function normalizeVolume(value: number, fallback = 100): number {
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return Math.max(0, Math.min(100, Math.round(value)));
}

export const uiSettings: UiSettings = {
  get username() {
    return getBattleUsername();
  },
  debug: readBoolean(STORAGE_KEYS.debug, false),
  logPath: readString(STORAGE_KEYS.logPath, "D:/"),
  serverAddress: readString(STORAGE_KEYS.serverAddress, DEFAULT_SERVER_ADDRESS),
  p2pEnabled: readBoolean(STORAGE_KEYS.p2pEnabled, false),
  stunServer: "",
  stunServers: [],
  music: readVolume(STORAGE_KEYS.music, 60),
  sound: readVolume(STORAGE_KEYS.sound, 60),
  battleHoverResources: readBoolean(STORAGE_KEYS.battleHoverResources, true),
  selfAuthed: readBoolean(STORAGE_KEYS.selfAuthed, false),
  keybinds: readKeybinds(),
  account: readAccountSettings(),
  joystick: readJoystickSettings(),
};

uiSettings.stunServers = normalizeStunServers(readStringArray(STORAGE_KEYS.stunServers, [DEFAULT_STUN_SERVER]));
uiSettings.stunServer = normalizeStunServer(readString(STORAGE_KEYS.stunServer, uiSettings.stunServers[0] ?? DEFAULT_STUN_SERVER));
if (!uiSettings.stunServers.includes(uiSettings.stunServer)) {
  uiSettings.stunServers = normalizeStunServers([uiSettings.stunServer, ...uiSettings.stunServers]);
}

export function setUsername(username: string): void {
  const normalized = normalizeUsername(username);
  uiSettings.account = { ...uiSettings.account, p1Username: normalized };
  writeAccountSettings(uiSettings.account);
  writeString(STORAGE_KEYS.username, normalized);
}

export function getProfileUsername(player: "Player1" | "Player2"): string {
  return player === "Player2" ? uiSettings.account.p2Username : uiSettings.account.p1Username;
}

export function getBattleUsername(): string {
  return getProfileUsername(uiSettings.account.battleProfile);
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

export function setBattleHoverResources(enabled: boolean): void {
  uiSettings.battleHoverResources = enabled;
  writeBoolean(STORAGE_KEYS.battleHoverResources, enabled);
}

export function setSelfAuthed(selfAuthed: boolean): void {
  uiSettings.selfAuthed = selfAuthed;
  writeBoolean(STORAGE_KEYS.selfAuthed, selfAuthed);
}

// 批量设置并保存自定义按键
export function setKeybinds(keybinds: KeybindSettings): void {
  uiSettings.keybinds = { ...keybinds };
  writeKeybinds(uiSettings.keybinds);
}

export function resetKeybindsToDefault(): void {
  uiSettings.keybinds = { ...DEFAULT_KEYBINDS };
  writeKeybinds(uiSettings.keybinds);
}

export function setJoystickSettings(joystick: JoystickSettings): void {
  uiSettings.joystick = { ...joystick };
  writeJoystickSettings(uiSettings.joystick);
}

export function resetJoystickSettingsToDefault(): void {
  uiSettings.joystick = { ...DEFAULT_JOYSTICK_SETTINGS };
  writeJoystickSettings(uiSettings.joystick);
}

export function setAccountSettings(account: AccountSettings): void {
  uiSettings.account = normalizeAccountSettings(account);
  writeAccountSettings(uiSettings.account);
  writeString(STORAGE_KEYS.username, uiSettings.account.p1Username);
}

export function resetAccountSettingsToDefault(): void {
  uiSettings.account = { ...DEFAULT_ACCOUNT_SETTINGS };
  writeAccountSettings(uiSettings.account);
}

function normalizeUsername(username: string): string {
  const trimmed = username.trim();
  return Array.from(trimmed || "Player").slice(0, MAX_PLAYER_NAME_LENGTH).join("");
}

function normalizeAccountSettings(account: AccountSettings): AccountSettings {
  return {
    ...account,
    p1Username: normalizeUsername(account.p1Username),
    p2Username: normalizeUsername(account.p2Username),
  };
}

function normalizeStunServer(server: string): string {
  const trimmed = server.trim() || DEFAULT_STUN_SERVER;
  return trimmed.startsWith("stun:") || trimmed.startsWith("stuns:") ? trimmed : `stun:${trimmed}`;
}

function normalizeStunServers(servers: readonly string[]): string[] {
  return Array.from(new Set([DEFAULT_STUN_SERVER, ...servers.map(normalizeStunServer)]));
}
