export type VirtualJoyControlId =
  | "moveJoystick"
  | "aimJoystick"
  | "pause"
  | "switch"
  | "reload"
  | "activeCard"
  | "bomb"
  | "shoot";

export interface VirtualJoyControlPosition {
  readonly x: number;
  readonly y: number;
}

export interface VirtualJoyControlSettings extends VirtualJoyControlPosition {
  readonly size: number;
  readonly alpha: number;
  readonly sensitivity?: number;
}

export type VirtualJoySettings = Record<VirtualJoyControlId, VirtualJoyControlSettings>;

export interface VirtualJoyLayout {
  readonly width: number;
  readonly height: number;
}

export const VIRTUAL_JOY_CONTROL_IDS: readonly VirtualJoyControlId[] = [
  "moveJoystick",
  "aimJoystick",
  "pause",
  "switch",
  "reload",
  "activeCard",
  "bomb",
  "shoot",
];

export const DEFAULT_VIRTUAL_JOY_SETTINGS: VirtualJoySettings = {
  moveJoystick: { x: 124 / 1280, y: 588 / 720, size: 1, alpha: 1, sensitivity: 1 },
  aimJoystick: { x: 1156 / 1280, y: 588 / 720, size: 1, alpha: 1, sensitivity: 1 },
  pause: { x: 70 / 1280, y: 62 / 720, size: 1, alpha: 1 },
  switch: { x: 92 / 1280, y: 76 / 720, size: 1, alpha: 1 },
  reload: { x: 92 / 1280, y: 178 / 720, size: 1, alpha: 1 },
  activeCard: { x: 1188 / 1280, y: 76 / 720, size: 1, alpha: 1 },
  bomb: { x: 1188 / 1280, y: 178 / 720, size: 1, alpha: 1 },
  shoot: { x: 1188 / 1280, y: 288 / 720, size: 1, alpha: 1 },
};

export function resolveVirtualJoyPosition(
  settings: VirtualJoySettings,
  control: VirtualJoyControlId,
  layout: VirtualJoyLayout,
): VirtualJoyControlPosition {
  const position = settings[control] ?? DEFAULT_VIRTUAL_JOY_SETTINGS[control];
  return {
    x: position.x * layout.width,
    y: position.y * layout.height,
  };
}

export function resolveVirtualJoySize(
  settings: VirtualJoySettings,
  control: VirtualJoyControlId,
): number {
  return settings[control]?.size ?? DEFAULT_VIRTUAL_JOY_SETTINGS[control].size;
}

export function resolveVirtualJoyAlpha(
  settings: VirtualJoySettings,
  control: VirtualJoyControlId,
): number {
  return settings[control]?.alpha ?? DEFAULT_VIRTUAL_JOY_SETTINGS[control].alpha;
}

export function resolveVirtualJoySensitivity(
  settings: VirtualJoySettings,
  control: "moveJoystick" | "aimJoystick",
): number {
  return normalizeSensitivity(settings[control]?.sensitivity, DEFAULT_VIRTUAL_JOY_SETTINGS[control].sensitivity ?? 1);
}

export function toVirtualJoyPosition(
  x: number,
  y: number,
  layout: VirtualJoyLayout,
): VirtualJoyControlPosition {
  return {
    x: clamp01(x / layout.width),
    y: clamp01(y / layout.height),
  };
}

export function normalizeVirtualJoySettings(value: unknown): VirtualJoySettings {
  const source = isRecord(value) ? value : {};
  return Object.fromEntries(
    VIRTUAL_JOY_CONTROL_IDS.map((id) => {
      const rawPosition = source[id];
      const fallback = DEFAULT_VIRTUAL_JOY_SETTINGS[id];
      if (!isRecord(rawPosition)) {
        return [id, fallback];
      }
      return [
        id,
        {
          x: normalizeAxis(rawPosition.x, fallback.x),
          y: normalizeAxis(rawPosition.y, fallback.y),
          size: normalizeScale(rawPosition.size, fallback.size),
          alpha: normalizeAlpha(rawPosition.alpha, fallback.alpha),
          sensitivity: id === "moveJoystick" || id === "aimJoystick"
            ? normalizeSensitivity(rawPosition.sensitivity, fallback.sensitivity ?? 1)
            : undefined,
        },
      ];
    }),
  ) as VirtualJoySettings;
}

function normalizeSensitivity(value: unknown, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.max(0.4, Math.min(2, value));
}

function normalizeAxis(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value)
    ? clamp01(value)
    : fallback;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function normalizeScale(value: unknown, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.max(0.6, Math.min(1.8, value));
}

function normalizeAlpha(value: unknown, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.max(0.2, Math.min(1, value));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
