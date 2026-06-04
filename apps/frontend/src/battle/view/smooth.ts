export function smoothValue(current: number, target: number, blend: number): number {
  const clampedBlend = Math.max(0, Math.min(1, blend));
  return current + (target - current) * clampedBlend;
}

/**
 * Distance-capped visual smoothing for rollback corrections.
 *
 * When the visual position is far from the target (e.g. after a rollback
 * correction), moves by at most `maxStep` pixels per frame using exponential
 * decay (half the remaining distance, then clamped).  Small errors ≤
 * `snapThreshold` are corrected instantly so imperceptible offsets don't
 * linger.
 *
 * This self-regulates independently of any `rollbackBlend` — during normal
 * gameplay the frame-to-frame delta is well below `snapThreshold`, so the
 * visual snaps to the target every frame and no smoothing is visible.
 */
export function smoothValueWithMaxStep(
  current: number,
  target: number,
  maxStep: number,
  snapThreshold: number,
): number {
  const delta = target - current;
  const distance = Math.abs(delta);

  if (distance <= snapThreshold) {
    return target;
  }

  // Move half the remaining distance, capped by maxStep.
  const step = Math.min(distance * 0.5, maxStep);
  return current + Math.sign(delta) * step;
}

export function smoothPointWithMaxStep(
  currentX: number,
  currentY: number,
  targetX: number,
  targetY: number,
  maxStep: number,
  snapThreshold: number,
): { readonly x: number; readonly y: number } {
  const deltaX = targetX - currentX;
  const deltaY = targetY - currentY;
  const distance = Math.hypot(deltaX, deltaY);

  if (distance <= snapThreshold) {
    return { x: targetX, y: targetY };
  }

  const step = Math.min(distance * 0.5, maxStep);
  const ratio = step / distance;
  return {
    x: currentX + deltaX * ratio,
    y: currentY + deltaY * ratio,
  };
}
