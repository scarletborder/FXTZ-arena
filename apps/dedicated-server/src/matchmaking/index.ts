import type { BattleRoomMode } from "@repo/types";

import type { InternalRoom } from "../room/types";

/**
 * Find a suitable room for quick match.
 *
 * Selection criteria:
 * 1. Must not have a password.
 * 2. Must be in "waiting" status.
 * 3. Must have at least one open slot.
 * 4. Prefer rooms that already have one player (closer to full).
 */
export function findQuickMatchRoom(rooms: InternalRoom[], battleMode: BattleRoomMode = "versus"): InternalRoom | null {
  const available = rooms.filter((r) => {
    if (r.battleMode !== battleMode) return false;
    if (r.password) return false;
    if (r.status !== "waiting") return false;
    return r.connectionIds.some((c) => c === null);
  });

  if (available.length === 0) return null;

  // Prefer rooms with more players (nearly full)
  available.sort((a, b) => {
    const aCount = a.connectionIds.filter(Boolean).length;
    const bCount = b.connectionIds.filter(Boolean).length;
    return bCount - aCount;
  });

  return available[0];
}
