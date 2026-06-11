import type { NeutralMobState } from "@repo/types";
import {
  ExampleFairy,
  type ExampleFairyMovementVariant,
} from "../../mobs/example-fairy";
import {
  HorizontalFairy,
  type HorizontalFairyMovementVariant,
} from "../../mobs/horizontal-fairy";
import type {
  BattleNeutralMob,
  NeutralMobSpawnerContext,
  NeutralMobSpawnerState,
} from "../../base";
import { WaveMobSpawner } from "../wave-spawner";
import type {
  CollaborateSpawnerNode,
  WaveSpawnerState,
  WaveMemberDefinition,
} from "../wave-types";
import { CollaborateBossFairy } from "./boss/collaborate-boss-fairy";
import {
  CollaborateEliteFairy,
  type CollaborateEliteSide,
  type CollaborateEliteVariant,
} from "./elites/collaborate-elite-fairy";

export interface ExampleCollaborateMobSpawnerState
  extends WaveSpawnerState,
    NeutralMobSpawnerState {
  readonly spawnerId: "example-collaborate-mob-spawner";
}

const MINION_WAVE_MIN_SECONDS = 8;
const MINION_WAVE_MAX_SECONDS = 18;
const SPECIAL_WAVE_MIN_SECONDS = 1;
const SPECIAL_WAVE_MAX_SECONDS = 999;

export class ExampleCollaborateMobSpawner extends WaveMobSpawner<ExampleCollaborateMobSpawnerState> {
  readonly id = "example-collaborate-mob-spawner";
  protected readonly nodes = EXAMPLE_COLLABORATE_NODES;

  createMobFromSnapshot(
    snapshot: NeutralMobState,
  ): BattleNeutralMob | undefined {
    switch (snapshot.kind) {
      case "example_fairy":
        return ExampleFairy.fromSnapshot(snapshot);
      case "horizontal_fairy":
        return HorizontalFairy.fromSnapshot(snapshot);
      case "collaborate_elite_fairy":
        return CollaborateEliteFairy.fromSnapshot(snapshot);
      case "collaborate_boss_fairy":
        return CollaborateBossFairy.fromSnapshot(snapshot);
      default:
        return undefined;
    }
  }
}

export const EXAMPLE_COLLABORATE_NODES: readonly CollaborateSpawnerNode[] = [
  ...createMinionBlock(1),
  shopNode(1),
  waveNode("elite-silly", [
    eliteMember("silly", "center", 0),
  ]),
  ...createMinionBlock(7),
  shopNode(2),
  waveNode("elite-pair", [
    eliteMember("plain", "left", 0),
    eliteMember("happy", "right", 0),
  ]),
  shopNode(3),
  waveNode("boss-mad", [bossMember(0)]),
];

function createMinionBlock(startWaveNumber: number): readonly CollaborateSpawnerNode[] {
  return Array.from({ length: 6 }, (_, index) => {
    const waveNumber = startWaveNumber + index;
    return minionWave(waveNumber, index);
  });
}

function minionWave(waveNumber: number, patternIndex: number): CollaborateSpawnerNode {
  const useHorizontal = patternIndex % 2 === 1;
  const members: WaveMemberDefinition[] = Array.from({ length: 8 }, (_, index) => {
    const finalDrop = index === 7;
    const spawnAtSeconds = index * 0.35;
    if (useHorizontal) {
      const variant: HorizontalFairyMovementVariant =
        index % 2 === 0 ? "left_to_right" : "right_to_left";
      return {
        key: `m${index}`,
        class: "minion",
        spawnAtSeconds,
        spawn: (ctx, params) => {
          const mob = new HorizontalFairy({
            arenaBounds: ctx.arenaBounds,
            id: ctx.allocateMobId({
              waveId: params.waveId,
              waveMemberIndex: params.memberIndex,
            }),
            waveId: params.waveId,
            movementVariant: variant,
            pointRewardSize: finalDrop ? "medium" : "small",
          });
          mob.state.moneyRewardSize = finalDrop ? "medium" : "small";
          ctx.spawnMob(mob);
        },
      };
    }

    const variant: ExampleFairyMovementVariant = index % 2 === 0 ? "left" : "right";
    return {
      key: `m${index}`,
      class: "minion",
      spawnAtSeconds,
      spawn: (ctx, params) => {
        const mob = new ExampleFairy({
          arenaBounds: ctx.arenaBounds,
          id: ctx.allocateMobId({
            waveId: params.waveId,
            waveMemberIndex: params.memberIndex,
          }),
          waveId: params.waveId,
          movementVariant: variant,
          pointRewardSize: finalDrop ? "medium" : "small",
        });
        mob.state.moneyRewardSize = finalDrop ? "medium" : "small";
        ctx.spawnMob(mob);
      },
    };
  });

  return {
    id: `minion-wave-${waveNumber}`,
    kind: "wave",
    members,
    minNextWaveSeconds: MINION_WAVE_MIN_SECONDS,
    maxNextWaveSeconds: MINION_WAVE_MAX_SECONDS,
  };
}

function waveNode(
  id: string,
  members: readonly WaveMemberDefinition[],
): CollaborateSpawnerNode {
  return {
    id,
    kind: "wave",
    members,
    minNextWaveSeconds: SPECIAL_WAVE_MIN_SECONDS,
    maxNextWaveSeconds: SPECIAL_WAVE_MAX_SECONDS,
  };
}

function shopNode(shopIndex: number): CollaborateSpawnerNode {
  return {
    id: `shop-${shopIndex}`,
    kind: "shop",
    x: 1200,
    y: 720,
    rarityPulls: { common: 4 },
  };
}

function eliteMember(
  variant: CollaborateEliteVariant,
  side: CollaborateEliteSide,
  spawnAtSeconds: number,
): WaveMemberDefinition {
  return {
    key: variant,
    class: "elite",
    spawnAtSeconds,
    spawn: (ctx, params) => {
      ctx.spawnMob(
        new CollaborateEliteFairy({
          arenaBounds: ctx.arenaBounds,
          id: ctx.allocateMobId({
            waveId: params.waveId,
            waveMemberIndex: params.memberIndex,
          }),
          waveId: params.waveId,
          variant,
          side,
          pointRewardSize: "large",
          moneyRewardSize: "large",
        }),
      );
    },
  };
}

function bossMember(spawnAtSeconds: number): WaveMemberDefinition {
  return {
    key: "mad-boss",
    class: "boss",
    spawnAtSeconds,
    spawn: (ctx: NeutralMobSpawnerContext, params) => {
      ctx.spawnMob(
        new CollaborateBossFairy({
          arenaBounds: ctx.arenaBounds,
          id: ctx.allocateMobId({
            waveId: params.waveId,
            waveMemberIndex: params.memberIndex,
          }),
          waveId: params.waveId,
          pointRewardSize: "large",
          moneyRewardSize: "large",
          rngSeed: 0x5eed0000 + params.waveId,
        }),
      );
    },
  };
}
