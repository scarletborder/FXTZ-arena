export function lerp(from: number, to: number, alpha: number): number {
  return from + (to - from) * alpha;
}

export function clampRatio(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(1, value));
}

export function smoothAngle(
  current: number,
  target: number,
  blend: number,
): number {
  const delta = Math.atan2(
    Math.sin(target - current),
    Math.cos(target - current),
  );
  return current + delta * Math.max(0, Math.min(1, blend));
}
