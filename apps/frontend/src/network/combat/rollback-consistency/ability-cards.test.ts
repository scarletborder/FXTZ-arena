import { describe, expect, it } from "vitest";

import { runRollbackConsistencyCase } from "./harness";
import {
  ABILITY_CARD_IDS,
  LATENCY_PROFILES,
  abilityCardLoadout,
} from "./matrix";

describe("ability-card rollback hash consistency", () => {
  for (const latency of LATENCY_PROFILES) {
    describe(latency.name, () => {
      for (const abilityCardId of ABILITY_CARD_IDS) {
        it.concurrent(
          abilityCardId,
          async () => {
            const result = await runRollbackConsistencyCase({
              name: `${latency.name}: ${abilityCardId}`,
              latencyMs: latency.latencyMs,
              playerOneLoadout: abilityCardLoadout({
                primaryCharacterId: "reimu",
                alternateCharacterId: "sakuya",
                abilityCardId,
              }),
              playerTwoLoadout: abilityCardLoadout({
                primaryCharacterId: "marisa",
                alternateCharacterId: "cirno",
                abilityCardId,
              }),
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
    });
  }
});
