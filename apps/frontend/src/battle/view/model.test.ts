import {
  createRaidLogicRuntime,
  type BattleInputState,
} from "@repo/raid-logic";
import { createDefaultCollaborateExtraState } from "@repo/types";
import { describe, expect, it } from "vitest";

import { createBattleViewModel } from "./model";

const input: BattleInputState = {
  moveX: 0,
  moveY: 0,
  aimX: 320,
  aimY: 240,
  shootPressed: false,
  bombPressed: false,
  activeCardPressed: false,
  reloadPressed: false,
  alternateHeld: false,
  infoHeld: true,
};

describe("createBattleViewModel", () => {
  it("projects local fighter and crosshair state before Phaser rendering", async () => {
    const runtime = createRaidLogicRuntime({ mode: "training" });
    await runtime.initialize();
    const output = runtime.outputQueue.drainAll().at(-1);
    if (!output) throw new Error("Initial battle output is unavailable");

    const model = createBattleViewModel({
      state: output.state,
      input,
      localFighterKey: "Player2",
      alpha: 0.5,
      rollbackBlend: 0.7,
    });

    expect(model.localFighter).toBe(output.state.target);
    expect(model.primaryCrosshair.ammoCount).toBe(output.state.target.ammo);
    expect(model.primaryCrosshair.pointerX).toBe(input.aimX);
    expect(model.infoHeld).toBe(true);
    expect(model.alpha).toBe(0.5);
    expect(model.rollbackBlend).toBe(0.7);
  });

  it("projects collaborate shop and transition presentation inputs", async () => {
    const runtime = createRaidLogicRuntime({ mode: "training" });
    await runtime.initialize();
    const output = runtime.outputQueue.drainAll().at(-1);
    if (!output) throw new Error("Initial battle output is unavailable");

    const baseExtra = createDefaultCollaborateExtraState();
    const model = createBattleViewModel({
      state: {
        ...output.state,
        collaborateExtra: {
          ...baseExtra,
          state: "transition_sync",
          pendingTransitionTarget: "boss",
          transitionType: "manual",
          player1TransitionReady: true,
          shop: {
            ...baseExtra.shop,
            open: true,
            shopIndex: 2,
            goodsByPlayerId: {
              ...baseExtra.shop.goodsByPlayerId,
              Player2: [{ id: "shop-2:life", kind: "life", price: 30 }],
            },
            purchasesByPlayerId: {
              ...baseExtra.shop.purchasesByPlayerId,
              Player2: ["shop-2:bomb"],
            },
            revivedByPlayerId: {
              ...baseExtra.shop.revivedByPlayerId,
              Player2: true,
            },
          },
          moneyByPlayerId: {
            ...baseExtra.moneyByPlayerId,
            Player1: 20,
            Player2: 50,
          },
        },
      },
      input,
      localFighterKey: "Player2",
    });

    expect(model.shop).toMatchObject({
      visible: true,
      open: true,
      displayIndex: 2,
      localFighterKey: "Player2",
      localMoney: 50,
      localRevived: true,
      purchasedItemIds: ["shop-2:bomb"],
    });
    expect(model.shop.goods).toEqual([
      { id: "shop-2:life", kind: "life", price: 30 },
    ]);
    expect(model.transition).toEqual({
      visible: true,
      target: "boss",
      readyCount: 1,
      localReady: false,
    });
  });
});
