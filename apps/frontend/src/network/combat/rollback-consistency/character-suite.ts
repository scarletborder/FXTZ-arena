import { describe, expect, it } from "vitest";
import type { CharacterId } from "@repo/types";

import { runRollbackConsistencyCase } from "./harness";
import {
  CHARACTER_IDS,
  LATENCY_PROFILES,
  characterLoadout,
} from "./matrix";

export function defineCharacterRollbackTests(
  playerOneCharacters: readonly CharacterId[],
): void {
  for (const latency of LATENCY_PROFILES) {
    describe(latency.name, () => {
      for (const playerOneCharacter of playerOneCharacters) {
        for (const playerTwoCharacter of CHARACTER_IDS) {
          it(
            `${playerOneCharacter} vs ${playerTwoCharacter}`,
            async () => {
              const result = await runRollbackConsistencyCase({
                name: `${latency.name}: ${playerOneCharacter} vs ${playerTwoCharacter}`,
                latencyMs: latency.latencyMs,
                playerOneLoadout: characterLoadout(playerOneCharacter),
                playerTwoLoadout: characterLoadout(playerTwoCharacter),
              });

              expect(result.playerOneHash).toBe(result.playerTwoHash);
              expect(result.playerOneGlobalHash).toBe(
                result.playerTwoGlobalHash,
              );
              expect(
                result.rollbackCounts.Player1 + result.rollbackCounts.Player2,
              ).toBeGreaterThan(0);
            },
            30_000,
          );
        }
      }
    });
  }
}
