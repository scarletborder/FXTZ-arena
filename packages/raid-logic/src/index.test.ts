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

  it("reimu reloads from current ammo one round at a time", () => {
    const battle = createReloadBattle("reimu", "marisa");
    battle.tick([createInput(0, "player-1", { shootPressed: true })]);
    for (let frame = 1; frame <= 10; frame += 1) {
      battle.tick([createInput(frame, "player-1")]);
    }
    battle.tick([createInput(11, "player-1", { shootPressed: true })]);

    const beforeReload = battle.state.fighters.get("player-1");
    expect(beforeReload?.ammo).toBe(3);

    battle.tick([createInput(12, "player-1", { reloadPressed: true })]);

    const reimu = battle.state.fighters.get("player-1");
    expect(reimu?.reloadStartedAmmo).toBe(3);
    expect(reimu?.reloadTotalTicks).toBe(96);
    expect(reimu?.reloadRemainingTicks).toBe(96);
    expect(reimu?.ammo).toBe(3);

    for (let frame = 13; (battle.state.fighters.get("player-1")?.reloadRemainingTicks ?? 0) > 0; frame += 1) {
      battle.tick([createInput(frame, "player-1")]);
    }

    expect(battle.state.fighters.get("player-1")?.ammo).toBe(5);
  });

  it("marisa discards current ammo and only restores at the end", () => {
    const battle = createReloadBattle("marisa", "reimu");
    battle.tick([createInput(0, "player-1", { shootPressed: true })]);

    battle.tick([createInput(1, "player-1", { reloadPressed: true })]);

    const marisa = battle.state.fighters.get("player-1");
    expect(marisa?.reloadStartedAmmo).toBe(0);
    expect(marisa?.reloadTotalTicks).toBe(180);
    expect(marisa?.reloadRemainingTicks).toBe(180);
    expect(marisa?.ammo).toBe(0);

    for (let frame = 2; (battle.state.fighters.get("player-1")?.reloadRemainingTicks ?? 0) > 0; frame += 1) {
      battle.tick([createInput(frame, "player-1")]);
    }

    expect(battle.state.fighters.get("player-1")?.ammo).toBe(2);
  });

  it("sakuya keeps current ammo and only restores at the end", () => {
    const battle = createReloadBattle("sakuya", "reimu");
    battle.tick([createInput(0, "player-1", { shootPressed: true })]);

    battle.tick([createInput(1, "player-1", { reloadPressed: true })]);

    const sakuya = battle.state.fighters.get("player-1");
    expect(sakuya?.reloadStartedAmmo).toBe(2);
    expect(sakuya?.reloadTotalTicks).toBe(60);
    expect(sakuya?.reloadRemainingTicks).toBe(60);
    expect(sakuya?.ammo).toBe(2);

    for (let frame = 2; (battle.state.fighters.get("player-1")?.reloadRemainingTicks ?? 0) > 0; frame += 1) {
      battle.tick([createInput(frame, "player-1")]);
    }

    expect(battle.state.fighters.get("player-1")?.ammo).toBe(3);
  });

  it("sakuya starts reload from 1/3 without consuming an immediate tick", () => {
    const battle = createReloadBattle("sakuya", "reimu");
    battle.tick([createInput(0, "player-1", { shootPressed: true })]);
    for (let frame = 1; frame <= 20; frame += 1) {
      battle.tick([createInput(frame, "player-1")]);
    }
    battle.tick([createInput(21, "player-1", { shootPressed: true })]);

    expect(battle.state.fighters.get("player-1")?.ammo).toBe(1);

    battle.tick([createInput(22, "player-1", { reloadPressed: true })]);

    const sakuya = battle.state.fighters.get("player-1");
    expect(sakuya?.reloadStartedAmmo).toBe(1);
    expect(sakuya?.reloadTotalTicks).toBe(120);
    expect(sakuya?.reloadRemainingTicks).toBe(120);
    expect(sakuya?.ammo).toBe(1);
  });

  it("sakuya starts reload from 0/3 without consuming an immediate tick", () => {
    const battle = createReloadBattle("sakuya", "reimu");
    battle.tick([createInput(0, "player-1", { shootPressed: true })]);
    for (let frame = 1; frame <= 20; frame += 1) {
      battle.tick([createInput(frame, "player-1")]);
    }
    battle.tick([createInput(21, "player-1", { shootPressed: true })]);
    for (let frame = 22; frame <= 42; frame += 1) {
      battle.tick([createInput(frame, "player-1")]);
    }
    battle.tick([createInput(43, "player-1", { shootPressed: true })]);

    expect(battle.state.fighters.get("player-1")?.ammo).toBe(0);

    battle.tick([createInput(44, "player-1", { reloadPressed: true })]);

    const sakuya = battle.state.fighters.get("player-1");
    expect(sakuya?.reloadStartedAmmo).toBe(0);
    expect(sakuya?.reloadTotalTicks).toBe(180);
    expect(sakuya?.reloadRemainingTicks).toBe(180);
    expect(sakuya?.ammo).toBe(0);
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

function createReloadBattle(
  primaryCharacterId: BattlePlayerConfig["loadout"]["primaryCharacterId"],
  alternateCharacterId: BattlePlayerConfig["loadout"]["alternateCharacterId"],
): ReturnType<typeof createRaidBattle> {
  return createRaidBattle(
    createDefaultBattleConfig("reload", [
      {
        playerId: "player-1",
        username: "Player 1",
        spawnPointId: "left",
        loadout: {
          primaryCharacterId,
          alternateCharacterId,
          abilityCardIds: [],
        },
      },
      {
        playerId: "player-2",
        username: "Player 2",
        spawnPointId: "right",
        loadout: {
          primaryCharacterId: "reimu",
          alternateCharacterId: "marisa",
          abilityCardIds: [],
        },
      },
    ]),
  );
}
