import {
  DEFAULT_COST_LIMIT,
  createDefaultBattleConfig,
  type BattlePlayerConfig,
  type PlayerLoadout,
} from "@repo/types";
import { beforeAll, describe, expect, it } from "vitest";

import {
  createDefaultRaidBattleConfig,
  createInitialState,
  ConfirmedFrameHashAccumulator,
  calculateLoadoutCost,
  createRaidBattle,
  encodeInput,
  ensureRapierInit,
  advanceFixedTick,
  runFixedTickExample,
  validateLoadout,
  type RaidFrameInput,
} from "./index";

const PLAYERS: readonly [BattlePlayerConfig, BattlePlayerConfig] = [
  {
    playerId: "Player1",
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
    playerId: "Player2",
    username: "Player 2",
    spawnPointId: "right",
    loadout: {
      primaryCharacterId: "sakuya",
      alternateCharacterId: "reimu",
      abilityCardIds: [],
    },
  },
];

beforeAll(async () => {
  await ensureRapierInit();
});

describe("@repo/raid-logic loadout validation", () => {
  it("calculates total character and ability card cost", () => {
    const loadout: PlayerLoadout = {
      primaryCharacterId: "reimu",
      alternateCharacterId: "sakuya",
      abilityCardIds: ["backdoor"],
    };

    expect(calculateLoadoutCost(loadout)).toBe(9);
  });

  it("accepts a legal standard loadout below the cost limit", () => {
    const result = validateLoadout({
      primaryCharacterId: "reimu",
      alternateCharacterId: "sakuya",
      abilityCardIds: ["backdoor"],
    });

    expect(result).toEqual({
      valid: true,
      totalCost: 9,
      errors: [],
    });
  });

  it("accepts standard loadouts at the cost limit", () => {
    const result = validateLoadout({
      primaryCharacterId: "reimu",
      alternateCharacterId: "sakuya",
      abilityCardIds: ["multi_shot", "spirit_strike_card"],
      activeAbilityCardId: "spirit_strike_card",
    });

    expect(result.totalCost).toBe(DEFAULT_COST_LIMIT);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("rejects standard loadouts that exceed the cost limit", () => {
    const result = validateLoadout({
      primaryCharacterId: "reimu",
      alternateCharacterId: "sakuya",
      abilityCardIds: ["multi_shot", "spirit_strike_card", "extra_life"],
      activeAbilityCardId: "spirit_strike_card",
    });

    expect(result.totalCost).toBe(DEFAULT_COST_LIMIT + 3);
    expect(result.errors).toContain("cost_limit_reached");
    expect(result.valid).toBe(false);
  });

  it("skips the cost cap in training mode", () => {
    const result = validateLoadout(
      {
        primaryCharacterId: "reimu",
        alternateCharacterId: "sakuya",
        abilityCardIds: ["extra_life", "ember"],
      },
      { mode: "training" },
    );

    expect(result.totalCost).toBe(13);
    expect(result.valid).toBe(true);
  });

  it("rejects duplicate characters", () => {
    const result = validateLoadout({
      primaryCharacterId: "reimu",
      alternateCharacterId: "reimu",
      abilityCardIds: [],
    });

    expect(result.errors).toContain("duplicate_characters");
  });

  it("requires the selected active card id to match the active card", () => {
    const missingActiveId = validateLoadout({
      primaryCharacterId: "reimu",
      alternateCharacterId: "sakuya",
      abilityCardIds: ["spirit_strike_card"],
    });
    const invalidActiveId = validateLoadout({
      primaryCharacterId: "reimu",
      alternateCharacterId: "sakuya",
      abilityCardIds: ["backdoor"],
      activeAbilityCardId: "spirit_strike_card",
    });

    expect(missingActiveId.errors).toContain("active_card_id_required");
    expect(invalidActiveId.errors).toContain("active_card_id_invalid");
  });
});

describe("@repo/raid-logic", () => {
  it("runs a deterministic fixed tick example", () => {
    expect(runFixedTickExample(3)).toEqual({
      frame: 3,
      fighters: [
        { playerId: "Player1", x: -288, y: 0 },
        { playerId: "Player2", x: 300, y: 0 },
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

  it("moves fighters using the active character definition in the legacy RaidState path", () => {
    const battle = createRaidBattle(
      createDefaultBattleConfig("legacy-speed", [
        {
          playerId: "Player1",
          username: "Player 1",
          spawnPointId: "left",
          loadout: {
            primaryCharacterId: "ellen",
            alternateCharacterId: "marisa",
            abilityCardIds: [],
          },
        },
        {
          playerId: "Player2",
          username: "Player 2",
          spawnPointId: "right",
          loadout: {
            primaryCharacterId: "reimu",
            alternateCharacterId: "sakuya",
            abilityCardIds: [],
          },
        },
      ]),
    );
    const startX = battle.state.fighters.get("Player1")!.x;

    battle.tick([createInput(0, "Player1", { moveX: 1 })]);
    expect(battle.state.fighters.get("Player1")!.x - startX).toBe(2);

    battle.tick([
      createInput(1, "Player1", { moveX: 1, alternateHeld: true }),
    ]);
    expect(battle.state.fighters.get("Player1")!.x - startX).toBe(7);
  });

  it("builds a deterministic BLAKE3 hash for confirmed frame hashes", () => {
    const first = new ConfirmedFrameHashAccumulator();
    const second = new ConfirmedFrameHashAccumulator();

    for (const sample of [
      { frame: 0, hashHex: "00000000" },
      { frame: 1, hashHex: "89abcdef" },
      { frame: 2, hashHex: "12345678" },
    ]) {
      first.addSample(sample);
      second.addSample(sample);
    }

    expect(first.digestHex()).toBe(second.digestHex());
    expect(first.digestHex(1)).toHaveLength(64);
    expect(first.digestHex(1)).not.toBe(first.digestHex(2));
    expect(first.samples).toBe(3);
    expect(first.lastSampledFrame).toBe(2);
  });

  it("restores a snapshot and replays to the same current hash", () => {
    const battle = createRaidBattle(
      createDefaultBattleConfig("rollback", PLAYERS),
    );
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
    const playerOneInput = createInput(0, "Player1", { moveX: 1 });
    const playerTwoInput = createInput(0, "Player2", { moveX: -1 });

    adapter.step(
      new Map([
        ["Player1", encodeInput(playerOneInput)],
        ["Player2", encodeInput(playerTwoInput)],
      ]),
    );

    const saved = adapter.serialize();
    const hash = adapter.hash();
    adapter.step(new Map());
    adapter.deserialize(saved);

    expect(adapter.hash()).toBe(hash);
  });

  it("keeps legacy advanceFixedTick fighter definitions from the default config", () => {
    const state = advanceFixedTick(
      {
        frame: 3,
        fighters: [
          { playerId: "Player1", x: -10, y: 0 },
          { playerId: "Player2", x: 10, y: 0 },
        ],
      },
      [],
    ) as ReturnType<typeof createInitialState>;

    expect(state.fighters[0].x).toBe(-10);
    expect(state.fighters[1].x).toBe(10);
  });

  it("reimu reloads from current ammo one round at a time", () => {
    const battle = createReloadBattle("reimu", "marisa");
    battle.tick([createInput(0, "Player1", { shootPressed: true })]);
    for (let frame = 1; frame <= 10; frame += 1) {
      battle.tick([createInput(frame, "Player1")]);
    }
    battle.tick([createInput(11, "Player1", { shootPressed: true })]);

    const beforeReload = battle.state.fighters.get("Player1");
    expect(beforeReload?.ammo).toBe(3);

    battle.tick([createInput(12, "Player1", { reloadPressed: true })]);

    const reimu = battle.state.fighters.get("Player1");
    expect(reimu?.reloadStartedAmmo).toBe(3);
    expect(reimu?.reloadTotalTicks).toBe(144);
    expect(reimu?.reloadRemainingTicks).toBe(144);
    expect(reimu?.ammo).toBe(3);

    for (
      let frame = 13;
      (battle.state.fighters.get("Player1")?.reloadRemainingTicks ?? 0) > 0;
      frame += 1
    ) {
      battle.tick([createInput(frame, "Player1")]);
    }

    expect(battle.state.fighters.get("Player1")?.ammo).toBe(5);
  });

  it("marisa discards current ammo and only restores at the end", () => {
    const battle = createReloadBattle("marisa", "reimu");
    battle.tick([createInput(0, "Player1", { shootPressed: true })]);

    battle.tick([createInput(1, "Player1", { reloadPressed: true })]);

    const marisa = battle.state.fighters.get("Player1");
    expect(marisa?.reloadStartedAmmo).toBe(0);
    expect(marisa?.reloadTotalTicks).toBe(180);
    expect(marisa?.reloadRemainingTicks).toBe(180);
    expect(marisa?.ammo).toBe(0);

    for (
      let frame = 2;
      (battle.state.fighters.get("Player1")?.reloadRemainingTicks ?? 0) > 0;
      frame += 1
    ) {
      battle.tick([createInput(frame, "Player1")]);
    }

    expect(battle.state.fighters.get("Player1")?.ammo).toBe(2);
  });

  it("sakuya keeps current ammo and only restores at the end", () => {
    const battle = createReloadBattle("sakuya", "reimu");
    battle.tick([createInput(0, "Player1", { shootPressed: true })]);

    battle.tick([createInput(1, "Player1", { reloadPressed: true })]);

    const sakuya = battle.state.fighters.get("Player1");
    expect(sakuya?.reloadStartedAmmo).toBe(2);
    expect(sakuya?.reloadTotalTicks).toBe(54);
    expect(sakuya?.reloadRemainingTicks).toBe(54);
    expect(sakuya?.ammo).toBe(2);

    for (
      let frame = 2;
      (battle.state.fighters.get("Player1")?.reloadRemainingTicks ?? 0) > 0;
      frame += 1
    ) {
      battle.tick([createInput(frame, "Player1")]);
    }

    expect(battle.state.fighters.get("Player1")?.ammo).toBe(3);
  });

  it("sakuya starts reload from 1/3 without consuming an immediate tick", () => {
    const battle = createReloadBattle("sakuya", "reimu");
    battle.tick([createInput(0, "Player1", { shootPressed: true })]);
    for (let frame = 1; frame <= 20; frame += 1) {
      battle.tick([createInput(frame, "Player1")]);
    }
    battle.tick([createInput(21, "Player1", { shootPressed: true })]);

    expect(battle.state.fighters.get("Player1")?.ammo).toBe(1);

    battle.tick([createInput(22, "Player1", { reloadPressed: true })]);

    const sakuya = battle.state.fighters.get("Player1");
    expect(sakuya?.reloadStartedAmmo).toBe(1);
    expect(sakuya?.reloadTotalTicks).toBe(108);
    expect(sakuya?.reloadRemainingTicks).toBe(108);
    expect(sakuya?.ammo).toBe(1);
  });

  it("sakuya starts reload from 0/3 without consuming an immediate tick", () => {
    const battle = createReloadBattle("sakuya", "reimu");
    battle.tick([createInput(0, "Player1", { shootPressed: true })]);
    for (let frame = 1; frame <= 20; frame += 1) {
      battle.tick([createInput(frame, "Player1")]);
    }
    battle.tick([createInput(21, "Player1", { shootPressed: true })]);
    for (let frame = 22; frame <= 42; frame += 1) {
      battle.tick([createInput(frame, "Player1")]);
    }
    battle.tick([createInput(43, "Player1", { shootPressed: true })]);

    expect(battle.state.fighters.get("Player1")?.ammo).toBe(0);

    battle.tick([createInput(44, "Player1", { reloadPressed: true })]);

    const sakuya = battle.state.fighters.get("Player1");
    expect(sakuya?.reloadStartedAmmo).toBe(0);
    expect(sakuya?.reloadTotalTicks).toBe(162);
    expect(sakuya?.reloadRemainingTicks).toBe(162);
    expect(sakuya?.ammo).toBe(0);
  });
});

function runHashSequence(): readonly number[] {
  const battle = createRaidBattle(
    createDefaultBattleConfig("determinism", PLAYERS),
  );
  const hashes: number[] = [];

  for (const frameInputs of createInputSequence(20)) {
    battle.tick(frameInputs);
    hashes.push(battle.hash());
  }

  return hashes;
}

function createInputSequence(frames: number): readonly RaidFrameInput[][] {
  return Array.from({ length: frames }, (_, frame) => [
    createInput(frame, "Player1", {
      moveX: frame % 3 === 0 ? 1 : 0,
      moveY: frame % 5 === 0 ? 1 : 0,
      shootPressed: frame === 2 || frame === 8,
      reloadPressed: frame === 9,
      alternateHeld: frame >= 6 && frame < 10,
    }),
    createInput(frame, "Player2", {
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
        playerId: "Player1",
        username: "Player 1",
        spawnPointId: "left",
        loadout: {
          primaryCharacterId,
          alternateCharacterId,
          abilityCardIds: [],
        },
      },
      {
        playerId: "Player2",
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
