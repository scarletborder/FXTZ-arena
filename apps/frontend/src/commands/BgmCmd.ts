import Phaser from "phaser";
import { getCombatMapDefinition } from "@repo/content";

import { settingsRepository } from "../store/settings";
import { assetUrl } from "../utils/assets";

export interface BgmConfigEntry {
  readonly file: string;
  readonly introStart: number;
  readonly loopStart: number;
  readonly loopEnd: number;
}

export type BgmConfig = Readonly<Record<string, BgmConfigEntry>>;

export interface BgmPlayOptions {
  readonly volume?: number;
}

export type BgmCommand =
  | {
    readonly type: "play";
    readonly key: string;
    readonly options: BgmPlayOptions;
  }
  | {
    readonly type: "stop";
  }
  | {
    readonly type: "reset";
  };

export type BgmCommandListener = (command: BgmCommand) => void;

export const BGM_CONFIG_CACHE_KEY = "bgm-config";

const listeners = new Set<BgmCommandListener>();

function emit(command: BgmCommand): void {
  for (const listener of listeners) {
    listener(command);
  }
}

function subscribe(listener: BgmCommandListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function Play(key: string, options: BgmPlayOptions = {}): void {
  const scaledVolume = resolveMusicVolume(options.volume);
  if (scaledVolume <= 0) {
    emit({ type: "stop" });
    return;
  }
  emit({
    type: "play",
    key,
    options: {
      ...options,
      volume: scaledVolume,
    },
  });
}

function PlayMap(mapId: string | undefined): void {
  const key = resolveMapBgmKey(mapId);
  if (key) {
    Play(key);
  }
}

function Stop(): void {
  emit({ type: "stop" });
}

function Reset(): void {
  emit({ type: "reset" });
}

function QueueLoad(scene: Phaser.Scene, mapId: string | undefined): number {
  let queued = 0;
  if (!scene.cache.json.exists(BGM_CONFIG_CACHE_KEY)) {
    scene.load.json(BGM_CONFIG_CACHE_KEY, assetUrl("assets/bgm/config.json"));
    queued += 1;
    return queued;
  }

  const config = getConfig(scene);
  const key = resolveMapBgmKey(mapId);
  if (!key) {
    return queued;
  }

  const entry = config[key];
  if (!entry || scene.cache.audio.exists(key)) {
    return queued;
  }

  scene.load.audio(key, assetUrl(`assets/${entry.file}`));
  queued += 1;
  return queued;
}

function getConfig(scene: Phaser.Scene): BgmConfig {
  const raw = scene.cache.json.get(BGM_CONFIG_CACHE_KEY) as unknown;
  return isBgmConfig(raw) ? raw : {};
}

function getEntry(scene: Phaser.Scene, key: string): BgmConfigEntry | undefined {
  return getConfig(scene)[key];
}

function resolveMapBgmKey(mapId: string | undefined): string | undefined {
  const map = getCombatMapDefinition(mapId ?? "hakurei_shrine") as
    | { readonly bgmKey?: unknown }
    | undefined;
  return typeof map?.bgmKey === "string" ? map.bgmKey : undefined;
}

const BgmCmd = {
  Play,
  PlayMap,
  Stop,
  Reset,
  QueueLoad,
  getConfig,
  getEntry,
  resolveMapBgmKey,
  subscribe,
};

export default BgmCmd;

function resolveMusicVolume(baseVolume: number | undefined): number {
  const normalizedBase = clampVolume(baseVolume ?? 1);
  const settingScale = clampVolume(settingsRepository.get().music / 100);
  return clampVolume(normalizedBase * settingScale);
}

function clampVolume(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(1, value));
}

function isBgmConfig(value: unknown): value is BgmConfig {
  if (!value || typeof value !== "object") {
    return false;
  }
  return Object.values(value).every((entry) => {
    if (!entry || typeof entry !== "object") {
      return false;
    }
    const item = entry as Partial<BgmConfigEntry>;
    const introStart = item.introStart;
    const loopStart = item.loopStart;
    const loopEnd = item.loopEnd;
    return (
      typeof item.file === "string" &&
      Number.isFinite(introStart) &&
      Number.isFinite(loopStart) &&
      Number.isFinite(loopEnd) &&
      typeof introStart === "number" &&
      typeof loopStart === "number" &&
      typeof loopEnd === "number" &&
      loopEnd > loopStart &&
      loopStart >= introStart
    );
  });
}
