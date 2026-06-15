import type { NeutralMobState } from "@repo/types";
import type {
  BattleNeutralMob,
  NeutralMobSpawnerContext,
  NeutralMobSpawnerState,
} from "../../base";
import { WaveMobSpawner } from "../wave-spawner";
import type {
  CollaborateSpawnerNode,
  WaveMemberDefinition,
  WaveSpawnerState,
} from "../wave-types";
import {
  TestArena2Fairy,
  type TestArena2FairyMovementVariant,
  type TestArena2FairySpecies,
} from "./mobs/test-arena-2-fairy";
import { TestArena2CirnoElite } from "./elites/test-arena-2-cirno-elite";
import { TestArena2EllenBoss } from "./boss/test-arena-2-ellen-boss";

export interface CollaborateTestArena2MobSpawnerState
  extends WaveSpawnerState,
    NeutralMobSpawnerState {
  readonly spawnerId: "collaborate-test-arena-2-mob-spawner";
}

const FRAME = 1 / 60;

export class CollaborateTestArena2MobSpawner extends WaveMobSpawner<CollaborateTestArena2MobSpawnerState> {
  readonly id = "collaborate-test-arena-2-mob-spawner";
  protected readonly nodes = COLLABORATE_TEST_ARENA_2_NODES;

  createMobFromSnapshot(snapshot: NeutralMobState): BattleNeutralMob | undefined {
    switch (snapshot.kind) {
      case "collaborate_test_arena_2_fairy":
        return TestArena2Fairy.fromSnapshot(snapshot);
      case "collaborate_test_arena_2_cirno_elite":
        return TestArena2CirnoElite.fromSnapshot(snapshot);
      case "collaborate_test_arena_2_ellen_boss":
        return TestArena2EllenBoss.fromSnapshot(snapshot);
      default:
        return undefined;
    }
  }
}

export const COLLABORATE_TEST_ARENA_2_NODES: readonly CollaborateSpawnerNode[] = [
  waveNode("minion-wave-1", [
    ...team("w1a", 4, 12, "fairy1", "w1_down", reward(2, "small", 2, "small")),
    ...team("w1b", 4, 12, "fairy1", "w1_up", reward(2, "small", 2, "small")),
  ], 8, 14),
  waveNode("minion-wave-2", [
    ...team("w2a", 5, 12, "fairy1", "w2_top", reward(3, "small", 2, "small")),
    ...team("w2b", 5, 12, "fairy1", "w2_bottom", reward(3, "small", 2, "small")),
  ], 10, 18),
  waveNode("minion-wave-3", [
    ...team("w3a", 3, 12, "fairy2", "w3_left", reward(3, "small", 3, "small", 1, "medium")),
    ...team("w3b", 3, 12, "fairy2", "w3_right", reward(3, "small", 3, "small", 1, "medium")),
  ], 12, 20),
  waveNode("minion-wave-4", [
    fairyMember("w4-top", "fairy3", "w4_top", 0, reward(0, "small", 0, "small")),
    fairyMember("w4-left", "fairy3", "w4_left", 0, reward(0, "small", 0, "small")),
    fairyMember("w4-right", "fairy3", "w4_right", 0, reward(0, "small", 0, "small")),
    fairyMember("w4-bottom", "fairy3", "w4_bottom", 0, reward(0, "small", 0, "small")),
  ], 10, 18),
  waveNode("elite-cirno", [cirnoMember(0)], 1, 999),
  shopNode(1),
  waveNode("minion-wave-5", [
    ...team("w5l", 4, 12, "fairy1", "w5_drop_left", reward(3, "small", 2, "small")),
    ...team("w5c", 4, 12, "fairy1", "w5_drop_center", reward(3, "small", 2, "small")),
    ...team("w5r", 4, 12, "fairy1", "w5_drop_right", reward(3, "small", 2, "small")),
    ...team("w5dl", 2, 25, "fairy2", "w5_diag_left", reward(5, "small", 3, "small", 1, "medium"), 36 * FRAME),
    ...team("w5dr", 2, 25, "fairy2", "w5_diag_right", reward(5, "small", 3, "small", 1, "medium"), 36 * FRAME),
  ], 12, 22),
  waveNode("minion-wave-6", [
    ...laneTeam("w6l20", 8, 20, "w6_left", 0.2),
    ...laneTeam("w6l40", 8, 20, "w6_left", 0.4),
    ...laneTeam("w6l60", 8, 20, "w6_left", 0.6),
    ...laneTeam("w6l80", 8, 20, "w6_left", 0.8),
    ...laneTeam("w6r20", 8, 20, "w6_right", 0.2),
    ...laneTeam("w6r40", 8, 20, "w6_right", 0.4),
    ...laneTeam("w6r60", 8, 20, "w6_right", 0.6),
    ...laneTeam("w6r80", 8, 20, "w6_right", 0.8),
  ], 10, 18),
  waveNode("minion-wave-7", [
    fairyMember("w7-left", "fairy3", "w7_left", 0, reward(2, "medium", 3, "small", 1, "large")),
    fairyMember("w7-right", "fairy3", "w7_right", 0, reward(2, "medium", 3, "small", 1, "large")),
  ], 10, 18),
  shopNode(2),
  waveNode("boss-ellen", [bossMember(0)], 1, 999),
];

function waveNode(
  id: string,
  members: readonly WaveMemberDefinition[],
  minNextWaveSeconds: number,
  maxNextWaveSeconds: number,
): CollaborateSpawnerNode {
  return { id, kind: "wave", members, minNextWaveSeconds, maxNextWaveSeconds };
}

function shopNode(shopIndex: number): CollaborateSpawnerNode {
  return {
    id: `shop-${shopIndex}`,
    kind: "shop",
    x: 1200,
    y: 720,
    rarityPulls: { common: 3 },
  };
}

function team(
  keyPrefix: string,
  count: number,
  frameGap: number,
  species: TestArena2FairySpecies,
  variant: TestArena2FairyMovementVariant,
  drops: ReturnType<typeof reward>,
  delaySeconds = 0,
): readonly WaveMemberDefinition[] {
  return Array.from({ length: count }, (_, index) =>
    fairyMember(`${keyPrefix}-${index}`, species, variant, delaySeconds + index * frameGap * FRAME, drops, index),
  );
}

function laneTeam(
  keyPrefix: string,
  count: number,
  frameGap: number,
  variant: "w6_left" | "w6_right",
  laneY: number,
): readonly WaveMemberDefinition[] {
  return Array.from({ length: count }, (_, index) => ({
    key: `${keyPrefix}-${index}`,
    class: "minion",
    spawnAtSeconds: index * frameGap * FRAME,
    spawn: (ctx, params) => {
      const mob = createFairy(ctx, params, "fairy1", variant, Math.round(laneY * 100), reward(5, "small", 3, "small"));
      mob.state.y = ctx.arenaBounds.height * laneY;
      mob.state.previousY = mob.state.y;
      ctx.spawnMob(mob);
    },
  }));
}

function fairyMember(
  key: string,
  species: TestArena2FairySpecies,
  variant: TestArena2FairyMovementVariant,
  spawnAtSeconds: number,
  drops: ReturnType<typeof reward>,
  spawnIndex = 0,
): WaveMemberDefinition {
  return {
    key,
    class: "minion",
    spawnAtSeconds,
    spawn: (ctx, params) => {
      ctx.spawnMob(createFairy(ctx, params, species, variant, spawnIndex, drops));
    },
  };
}

function createFairy(
  ctx: NeutralMobSpawnerContext,
  params: { readonly waveId: number; readonly memberIndex: number },
  species: TestArena2FairySpecies,
  variant: TestArena2FairyMovementVariant,
  spawnIndex: number,
  drops: ReturnType<typeof reward>,
): TestArena2Fairy {
  return new TestArena2Fairy({
    arenaBounds: ctx.arenaBounds,
    id: ctx.allocateMobId({
      waveId: params.waveId,
      waveMemberIndex: params.memberIndex,
    }),
    waveId: params.waveId,
    species,
    movementVariant: variant,
    spawnIndex,
    moneyRewardDrops: drops.moneyRewardDrops,
    powerRewardDrops: drops.powerRewardDrops,
  });
}

function cirnoMember(spawnAtSeconds: number): WaveMemberDefinition {
  return {
    key: "cirno",
    class: "elite",
    spawnAtSeconds,
    spawn: (ctx, params) => {
      ctx.spawnMob(new TestArena2CirnoElite({
        arenaBounds: ctx.arenaBounds,
        id: ctx.allocateMobId({ waveId: params.waveId, waveMemberIndex: params.memberIndex }),
        waveId: params.waveId,
        rngSeed: 0xc1000000 + params.waveId,
        moneyRewardDrops: [{ size: "medium", count: 2 }],
        powerRewardDrops: [{ size: "medium", count: 2 }, { size: "small", count: 5 }],
      }));
    },
  };
}

function bossMember(spawnAtSeconds: number): WaveMemberDefinition {
  return {
    key: "ellen",
    class: "boss",
    spawnAtSeconds,
    spawn: (ctx, params) => {
      ctx.spawnMob(new TestArena2EllenBoss({
        arenaBounds: ctx.arenaBounds,
        id: ctx.allocateMobId({ waveId: params.waveId, waveMemberIndex: params.memberIndex }),
        waveId: params.waveId,
        rngSeed: 0xe11e0000 + params.waveId,
      }));
    },
  };
}

function reward(
  moneyCount: number,
  moneySize: "small" | "medium" | "large",
  powerCount: number,
  powerSize: "small" | "medium" | "large",
  extraPowerCount = 0,
  extraPowerSize: "small" | "medium" | "large" = "small",
) {
  return {
    moneyRewardDrops: moneyCount > 0 ? [{ size: moneySize, count: moneyCount }] : undefined,
    powerRewardDrops: [
      ...(powerCount > 0 ? [{ size: powerSize, count: powerCount }] : []),
      ...(extraPowerCount > 0 ? [{ size: extraPowerSize, count: extraPowerCount }] : []),
    ],
  };
}
