import { DEFAULT_ARENA_BOUNDS, normalizeArenaBounds, type ArenaBounds } from "@repo/constants";
import { connectionManager } from "../../menu/shared";
import { getCombatMapDefinition } from "@repo/content";

export function createLocalBattleConnectionManager(): typeof connectionManager {
  return {
    send: () => undefined,
    setMessageHandler: () => undefined,
  } as unknown as typeof connectionManager;
}

export function resolveArenaBounds(mapId: string | undefined): ArenaBounds {
  const map = getCombatMapDefinition(mapId ?? "hakurei_shrine");
  if (!map) {
    return DEFAULT_ARENA_BOUNDS;
  }
  return normalizeArenaBounds({
    width: map.width,
    height: map.height,
    viewportWidth: map.viewportWidth,
    viewportHeight: map.viewportHeight,
  });
}

export function createResultPlayerSummary(
  name: string,
  fighterState: { shotsFired: number; bombUses: number; hitsTaken: number }
) {
  return {
    name,
    shots: fighterState.shotsFired,
    bombUses: fighterState.bombUses,
    hitsTaken: fighterState.hitsTaken,
  };
}