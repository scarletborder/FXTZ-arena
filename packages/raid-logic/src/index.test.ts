import { createDefaultBattleConfig, type BattlePlayerConfig } from "@repo/types";
import { describe, expect, it } from "vitest";

import {
  createDefaultRaidBattleConfig,
  createInitialState,
  createRaidBattle,
  encodeInput,
  runFixedTickExample,
  type RaidFrameInput,
} from "./index";

const PLAYERS: readonly [BattlePlayerConfig, BattlePlayerConfig] = [
  {
    playerId: "player-1",
    username: "Player 1",
    spawnPointId: "left",
    loadout: {
      primaryCharacterId: "reimu",
      alternateCharacterId: "marisa",
      abilityCardIds: ["spirit_strike_card"],
      activeAbilityCardId: "spirit_strike_card",
    },
  },
  {
    playerId: "player-2",
    username: "Player 2",
    spawnPointId: "right",
    loadout: {
      primaryCharacterId: "sakuya",
      alternateCharacterId: "reimu",
      abilityCardIds: [],
    },
  },
];

describe("@repo/raid-logic", () => {
  it("runs a deterministic fixed tick example", () => {
    expect(runFixedTickExample(3)).toEqual({
      frame: 3,
      fighters: [
        { playerId: "player-1", x: -288, y: 0 },
        { playerId: "player-2", x: 300, y: 0 },
      ],
    });
  });

  it("creates a stable initial state", () => {
    expect(createInitialState().frame).toBe(0);
  });

  it("generates the same hash sequence for the same input sequence", () => {
    const first = runHashSequence();
    const second = runHashSequence();

    expect(second).toEqual(first);
  });

  it("restores a snapshot and replays to the same current hash", () => {
    const battle = createRaidBattle(createDefaultBattleConfig("rollback", PLAYERS));
    const inputs = createInputSequence(12);

    for (const frameInputs of inputs) {
      battle.tick(frameInputs);
    }

    const originalHash = battle.hash();
    battle.restoreAndReplay(4, 12);

    expect(battle.frame).toBe(12);
    expect(battle.hash()).toBe(originalHash);
  });

  it("serializes through the rollback-netcode compatible adapter", () => {
    const battle = createRaidBattle(createDefaultRaidBattleConfig());
    const adapter = battle.createRollbackAdapter();
    const playerOneInput = createInput(0, "player-1", { moveX: 1 });
    const playerTwoInput = createInput(0, "player-2", { moveX: -1 });

    adapter.step(
      new Map([
        ["player-1", encodeInput(playerOneInput)],
        ["player-2", encodeInput(playerTwoInput)],
      ]),
    );

    const saved = adapter.serialize();
    const hash = adapter.hash();
    adapter.step(new Map());
    adapter.deserialize(saved);

    expect(adapter.hash()).toBe(hash);
  });

  it("does not reset Sakuya ammo to zero when reloading", () => {
    const battle = createRaidBattle(createDefaultBattleConfig("sakuya-reload", PLAYERS));

    battle.tick([createInput(0, "player-2", { shootPressed: true })]);
    battle.tick([createInput(1, "player-2", { shootPressed: true })]);
    expect(battle.state.fighters.get("player-2")?.ammo).toBe(1);

    battle.tick([createInput(2, "player-2", { reloadPressed: true })]);

    const sakuya = battle.state.fighters.get("player-2");
    expect(sakuya?.ammo).toBe(1);
    expect(sakuya?.reloadTotalTicks).toBe(120);
  });
});

function runHashSequence(): readonly number[] {
  const battle = createRaidBattle(createDefaultBattleConfig("determinism", PLAYERS));
  const hashes: number[] = [];

  for (const frameInputs of createInputSequence(20)) {
    battle.tick(frameInputs);
    hashes.push(battle.hash());
  }

  return hashes;
}

function createInputSequence(frames: number): readonly RaidFrameInput[][] {
  return Array.from({ length: frames }, (_, frame) => [
    createInput(frame, "player-1", {
      moveX: frame % 3 === 0 ? 1 : 0,
      moveY: frame % 5 === 0 ? 1 : 0,
      shootPressed: frame === 2 || frame === 8,
      reloadPressed: frame === 9,
      alternateHeld: frame >= 6 && frame < 10,
    }),
    createInput(frame, "player-2", {
      moveX: frame % 4 === 0 ? -1 : 0,
      moveY: frame % 6 === 0 ? -1 : 0,
      bombPressed: frame === 3,
      infoHeld: frame >= 7,
    }),
  ]);
}

function createInput(
  frame: number,
  playerId: RaidFrameInput["playerId"],
  overrides: Partial<RaidFrameInput> = {},
): RaidFrameInput {
  return {
    frame,
    playerId,
    moveX: 0,
    moveY: 0,
    aimAngleTicks: frame * 100,
    shootPressed: false,
    bombPressed: false,
    activeCardPressed: false,
    reloadPressed: false,
    alternateHeld: false,
    infoHeld: false,
    ...overrides,
  };
}
