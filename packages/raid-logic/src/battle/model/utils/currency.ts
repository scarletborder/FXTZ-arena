export function clampCollaborateCurrency(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(Number.MAX_SAFE_INTEGER, Math.floor(value)));
}
