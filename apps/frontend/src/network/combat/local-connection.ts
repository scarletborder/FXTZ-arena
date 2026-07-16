import type { CombatConnection } from "./types";

export function createLocalCombatConnection(): CombatConnection {
  return {
    send: () => undefined,
    setMessageHandler: () => undefined,
  };
}
