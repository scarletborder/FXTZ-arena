import {
  createDefaultBattleConfig,
  TICK_RATE,
  type BattleConfig,
  type FrameInput,
} from "@repo/types";

import { advanceFixedTick as advanceBattleFixedTick, RaidBattle } from "./game";

export * from "./constants";
export * from "./entities";
export * from "./game";
export * from "./sync/hash";
export * from "./input";
export * from "./physics-world";
export * from "./sync/rollback";
export * from "./sync/state";
export * from "./battle/loadout";
export * from "./battle/model";
export * from "./battle/model/physics-adapter";
export * from "./battle/model/snapshot";
export * from "./battle/output";
export * from "./battle/runtime";
export * from "./battle/utils/validation";
export type {
  BattleOutputState,
  EffectState,
  FighterKey,
  FighterState,
  PointState,
  ProjectileKind,
  ProjectileState,
  ShieldState,
  TrainingStats,
} from "@repo/content";
export type { BattleInputState } from "@repo/types";

export interface LegacyFighterState {
  readonly playerId: string;
  readonly x: number;
  readonly y: number;
}

export interface RaidState {
  readonly frame: number;
  readonly fighters: readonly [LegacyFighterState, LegacyFighterState];
}

export function createDefaultRaidBattleConfig(): BattleConfig {
  return createDefaultBattleConfig("battle-m2", [
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
  ]);
}

export function createInitialState(): RaidState {
  return toLegacyState(new RaidBattle(createDefaultRaidBattleConfig()));
}

export function advanceFixedTick(
  stateOrBattle: RaidState | RaidBattle,
  inputs: readonly FrameInput[] = [],
): RaidState | RaidBattle {
  if (stateOrBattle instanceof RaidBattle) {
    return advanceBattleFixedTick(stateOrBattle, [...inputs]);
  }

  const battle = new RaidBattle(createDefaultRaidBattleConfig());
  const serialized = battle.state.serialize();
  battle.state.deserialize({
    ...serialized,
    frame: stateOrBattle.frame,
    fighters: stateOrBattle.fighters.map((fighter, index) => ({
      ...(serialized.fighters[index] ?? serialized.fighters[0]!),
      data: {
        ...(serialized.fighters[index] ?? serialized.fighters[0]!).data,
        playerId: fighter.playerId as "Player1" | "Player2",
        x: fighter.x,
        y: fighter.y,
        vx: 0,
        vy: 0,
      },
    })),
  });
  advanceBattleFixedTick(battle, [...inputs]);
  return toLegacyState(battle);
}

export function runFixedTickExample(frames = TICK_RATE): RaidState {
  const battle = new RaidBattle(createDefaultRaidBattleConfig());

  for (let frame = 0; frame < frames; frame += 1) {
    advanceBattleFixedTick(battle, [
      {
        frame,
        playerId: "Player1",
        moveX: 1,
        moveY: 0,
        aimRadians: 0,
        fire: false,
        bomb: false,
        reload: false,
        switchCharacter: false,
      },
    ]);
  }

  return toLegacyState(battle);
}

function toLegacyState(battle: RaidBattle): RaidState {
  const players = battle.state.toBattleSnapshot().players;
  return {
    frame: battle.frame,
    fighters: [
      {
        playerId: players[0]?.playerId ?? "Player1",
        x: players[0]?.x ?? 0,
        y: players[0]?.y ?? 0,
      },
      {
        playerId: players[1]?.playerId ?? "Player2",
        x: players[1]?.x ?? 0,
        y: players[1]?.y ?? 0,
      },
    ],
  };
}
