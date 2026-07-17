import { describe, expect, it } from "vitest";

import {
  BattleFramePipeline,
  type BattleFramePipelineContext,
  type BattleFrameInputPair,
} from "./frame-pipeline";
import { createBattleFrameBranchManagers } from "./frame-branch-manager";

const inputPair: BattleFrameInputPair = {
  firstInput: {
    moveX: 0,
    moveY: 0,
    aimX: 0,
    aimY: 0,
    shootPressed: false,
    bombPressed: false,
    activeCardPressed: false,
    reloadPressed: false,
    alternateHeld: false,
    infoHeld: false,
  },
  secondInput: undefined,
  firstIsPlayer: true,
};

describe("BattleFramePipeline", () => {
  it("stops after collaborate transition sync handles the frame", () => {
    const context = createContext({
      processCollaborateTransitionSync: () => true,
    });

    createPipeline(context).advance(inputPair);

    expect(context.calls).toEqual([
      "ensurePhysicsReady",
      "beginFrame",
      "processCollaborateTransitionSync",
    ]);
  });

  it("keeps a shop frame out of running phases when the shop stays open", () => {
    const context = createContext({
      isCollaborateShopOpen: () => true,
    });

    createPipeline(context).advance(inputPair);

    expect(context.calls).toEqual([
      "ensurePhysicsReady",
      "beginFrame",
      "processCollaborateTransitionSync",
      "isCollaborateShopOpen",
      "processCollaborateShopInputs",
      "stepMobSpawner",
      "isCollaborateShopOpen",
    ]);
  });

  it("runs the battle phases after shop input closes the shop", () => {
    const context = createContext({
      isCollaborateShopOpen: () =>
        context.calls.filter((call) => call === "isCollaborateShopOpen")
          .length === 1,
    });

    createPipeline(context).advance(inputPair);

    expect(context.calls).toEqual([
      "ensurePhysicsReady",
      "beginFrame",
      "processCollaborateTransitionSync",
      "isCollaborateShopOpen",
      "processCollaborateShopInputs",
      "stepMobSpawner",
      "isCollaborateShopOpen",
      "beginRunningFrame",
      "processFighterActions",
      "stepProjectileCommands",
      "stepMobSpawner",
      "stepNeutralMobs",
      "resolveProjectileClashes",
      "stepProjectiles",
      "removeInactiveNeutralMobs",
      "stepPoints",
      "syncPointBodies",
      "flushDeferredSpawns",
      "stepEffects",
    ]);
  });

  it("runs normal battle phases in deterministic order", () => {
    const context = createContext();

    createPipeline(context).advance(inputPair);

    expect(context.calls).toEqual([
      "ensurePhysicsReady",
      "beginFrame",
      "processCollaborateTransitionSync",
      "isCollaborateShopOpen",
      "beginRunningFrame",
      "processFighterActions",
      "stepProjectileCommands",
      "stepMobSpawner",
      "stepNeutralMobs",
      "resolveProjectileClashes",
      "stepProjectiles",
      "removeInactiveNeutralMobs",
      "stepPoints",
      "syncPointBodies",
      "flushDeferredSpawns",
      "stepEffects",
    ]);
  });

  it("skips running phases after timers end the battle", () => {
    const context = createContext({
      beginRunningFrame: () => true,
    });

    createPipeline(context).advance(inputPair);

    expect(context.calls).toEqual([
      "ensurePhysicsReady",
      "beginFrame",
      "processCollaborateTransitionSync",
      "isCollaborateShopOpen",
      "beginRunningFrame",
    ]);
  });
});

function createContext(
  overrides: Partial<BattleFramePipelineContext> = {},
): BattleFramePipelineContext & { readonly calls: string[] } {
  const calls: string[] = [];
  const record = (name: string): void => {
    calls.push(name);
  };

  return {
    calls,
    ensurePhysicsReady: () => {
      record("ensurePhysicsReady");
      overrides.ensurePhysicsReady?.();
    },
    beginFrame: () => {
      record("beginFrame");
      overrides.beginFrame?.();
    },
    processCollaborateTransitionSync: (pair) => {
      record("processCollaborateTransitionSync");
      return overrides.processCollaborateTransitionSync?.(pair) ?? false;
    },
    isCollaborateShopOpen: () => {
      record("isCollaborateShopOpen");
      return overrides.isCollaborateShopOpen?.() ?? false;
    },
    processCollaborateShopInputs: (pair) => {
      record("processCollaborateShopInputs");
      overrides.processCollaborateShopInputs?.(pair);
    },
    stepMobSpawner: () => {
      record("stepMobSpawner");
      overrides.stepMobSpawner?.();
    },
    beginRunningFrame: () => {
      record("beginRunningFrame");
      return overrides.beginRunningFrame?.() ?? false;
    },
    processFighterActions: (pair) => {
      record("processFighterActions");
      overrides.processFighterActions?.(pair);
    },
    stepProjectileCommands: () => {
      record("stepProjectileCommands");
      overrides.stepProjectileCommands?.();
    },
    stepNeutralMobs: () => {
      record("stepNeutralMobs");
      overrides.stepNeutralMobs?.();
    },
    resolveProjectileClashes: () => {
      record("resolveProjectileClashes");
      overrides.resolveProjectileClashes?.();
    },
    stepProjectiles: () => {
      record("stepProjectiles");
      overrides.stepProjectiles?.();
    },
    removeInactiveNeutralMobs: () => {
      record("removeInactiveNeutralMobs");
      overrides.removeInactiveNeutralMobs?.();
    },
    stepPoints: () => {
      record("stepPoints");
      overrides.stepPoints?.();
    },
    syncPointBodies: () => {
      record("syncPointBodies");
      overrides.syncPointBodies?.();
    },
    flushDeferredSpawns: () => {
      record("flushDeferredSpawns");
      overrides.flushDeferredSpawns?.();
    },
    stepEffects: () => {
      record("stepEffects");
      overrides.stepEffects?.();
    },
  };
}

function createPipeline(context: BattleFramePipelineContext): BattleFramePipeline {
  return new BattleFramePipeline(
    context,
    createBattleFrameBranchManagers(context),
  );
}
