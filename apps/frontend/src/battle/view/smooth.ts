export function smoothValue(current: number, target: number, blend: number): number {
  const clampedBlend = Math.max(0, Math.min(1, blend));
  return current + (target - current) * clampedBlend;
}