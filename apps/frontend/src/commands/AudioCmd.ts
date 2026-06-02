import { uiSettings } from "../store/settings";

export interface AudioPlayOptions {
  readonly loop?: boolean;
  readonly groupKey?: string;
  readonly holdMs?: number;
  readonly volume?: number;
  readonly rate?: number;
  readonly detune?: number;
  readonly delay?: number;
  readonly pan?: number;
}

export type AudioCommand =
  | {
    readonly type: "play";
    readonly key: string;
    readonly options: AudioPlayOptions;
  }
  | {
    readonly type: "unlock";
  }
  | {
    readonly type: "reset";
  };

export type AudioCommandListener = (command: AudioCommand) => void;

const listeners = new Set<AudioCommandListener>();

function emit(command: AudioCommand): void {
  for (const listener of listeners) {
    listener(command);
  }
}

function subscribe(listener: AudioCommandListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function Play(key: string, options: AudioPlayOptions = {}): void {
  const scaledVolume = resolveSoundVolume(options.volume);
  if (scaledVolume <= 0) {
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

function Unlock(): void {
  emit({ type: "unlock" });
}

function Reset(): void {
  emit({ type: "reset" });
}

const AudioCmd = {
  Play,
  Unlock,
  Reset,
  subscribe,
};

export default AudioCmd;

function resolveSoundVolume(baseVolume: number | undefined): number {
  const normalizedBase = clampVolume(baseVolume ?? 1);
  const settingScale = clampVolume(uiSettings.sound / 100);
  return clampVolume(normalizedBase * settingScale);
}

function clampVolume(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(1, value));
}
