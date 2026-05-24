import type { BattleLoadouts } from "./loadout";
import { BattleModel } from "./model";
import { BattlePhysics } from "./model/physics-adapter";
import { createPointState, pointVelocityFromFrame } from "./model/points";
import type { BattleModelSnapshot } from "./model/snapshot";
import {
  BattleOutputQueue,
  type BattleOutputEvent,
  type BattleOutputFrame,
} from "./output";
import type { BattleInputState } from "@repo/types";
import type { BattleOutputState } from "@repo/content";
import { DEFAULT_MAPS, resolveMobSpawner } from "@repo/content";
import type { NeutralMobSpawner } from "@repo/content";

export type RaidLogicMode = "training" | "ai" | "online";

export type RaidLogicStepInput =
  | {
      readonly mode: "training" | "ai";
      readonly player: BattleInputState;
    }
  | {
      readonly mode: "online";
      readonly player: BattleInputState;
      readonly target: BattleInputState;
      /**
       * Priority order for simultaneous actions.
       * When true (default), the "player" fighter (Player1 / host) is processed first.
       * When false, the "target" fighter (Player2) is processed first.
       * Determined by playerId: lower playerId → higher priority.
       */
      readonly hostIsPlayer?: boolean;
    };

export interface RaidLogicRuntimeOptions {
  readonly mode: RaidLogicMode;
  readonly loadouts?: BattleLoadouts;
  readonly mapId?: string;
}

export interface RaidLogicRuntime {
  readonly mode: RaidLogicMode;
  readonly outputQueue: BattleOutputQueue;
  readonly state: BattleOutputState;
  readonly frame: number;
  readonly gameOver: boolean;
  readonly physicsReady: boolean;
  initialize(): Promise<void>;
  readDebugBodies(): ReturnType<BattlePhysics["readAllBodies"]>;
  debugSpawnPoint(params: {
    readonly value: 1 | 5 | 10;
    readonly x: number;
    readonly y: number;
  }): BattleOutputFrame;
  debugSetPoint(pointCount: number): BattleOutputFrame;
  step(input: RaidLogicStepInput): BattleOutputFrame;
  reset(): BattleOutputFrame;
  serialize(): BattleModelSnapshot;
  deserialize(snapshot: BattleModelSnapshot): BattleOutputFrame;
  hash(): number;
  hashHex(): string;
}

class BattleRuntime implements RaidLogicRuntime {
  readonly outputQueue = new BattleOutputQueue();
  private readonly model: BattleModel;
  private readonly physics = new BattlePhysics();
  private initializePromise: Promise<void> | undefined;

  constructor(
    readonly mode: RaidLogicMode,
    loadouts: BattleLoadouts | undefined,
    mapId: string | undefined,
  ) {
    const spawner = resolveSpawner(mode, mapId);
    this.model = new BattleModel(loadouts, {
      enableCpuTarget: mode === "ai",
      neutralMobSpawner: spawner,
    });
    this.enqueueOutput([
      { type: "snapshot_restored", frame: this.model.frame },
    ]);
  }

  get state(): BattleOutputState {
    return this.model.toOutputState();
  }

  get frame(): number {
    return this.model.frame;
  }

  get gameOver(): boolean {
    return this.model.gameOver;
  }

  get physicsReady(): boolean {
    return this.model.isPhysicsReady();
  }

  initialize(): Promise<void> {
    this.initializePromise ??= this.physics.init().then(() => {
      this.model.setPhysics(this.physics);
    });
    return this.initializePromise;
  }

  readDebugBodies(): ReturnType<BattlePhysics["readAllBodies"]> {
    return this.physics.readAllBodies();
  }

  debugSpawnPoint(params: {
    readonly value: 1 | 5 | 10;
    readonly x: number;
    readonly y: number;
  }): BattleOutputFrame {
    const velocity = pointVelocityFromFrame(this.model.frame, "low");
    this.model.addPoint(
      createPointState({
        id: this.model.allocatePointId(),
        x: params.x,
        y: params.y,
        value: params.value,
        vx: velocity.vx,
        vy: velocity.vy,
      }),
    );
    this.physics.syncPointBodies(this.model.points);
    return this.enqueueOutput([
      { type: "snapshot_restored", frame: this.model.frame },
    ]);
  }

  debugSetPoint(pointCount: number): BattleOutputFrame {
    this.model.setPlayerPointCount(pointCount);
    return this.enqueueOutput([
      { type: "snapshot_restored", frame: this.model.frame },
    ]);
  }

  step(input: RaidLogicStepInput): BattleOutputFrame {
    if (!this.physicsReady) {
      throw new Error("RaidLogicRuntime must be initialized before stepping");
    }

    if (input.mode !== this.mode) {
      throw new Error(
        `Cannot step ${this.mode} runtime with ${input.mode} input`,
      );
    }

    if (input.mode === "online") {
      this.model.stepVersus(
        input.player,
        input.target,
        input.hostIsPlayer ?? true,
      );
    } else {
      this.model.step(input.player);
    }

    return this.enqueueOutput([
      { type: "frame_advanced", frame: this.model.frame },
    ]);
  }

  reset(): BattleOutputFrame {
    this.model.reset();
    return this.enqueueOutput([
      { type: "snapshot_restored", frame: this.model.frame },
    ]);
  }

  serialize(): BattleModelSnapshot {
    return this.model.serialize();
  }

  deserialize(snapshot: BattleModelSnapshot): BattleOutputFrame {
    this.model.deserialize(snapshot);
    return this.enqueueOutput([
      { type: "snapshot_restored", frame: this.model.frame },
    ]);
  }

  hash(): number {
    return this.model.hash();
  }

  hashHex(): string {
    return this.model.hashHex();
  }

  private enqueueOutput(
    events: readonly BattleOutputEvent[],
  ): BattleOutputFrame {
    const frame = {
      frame: this.model.frame,
      hash: this.model.hash(),
      hashHex: this.model.hashHex(),
      state: this.model.toOutputState(),
      snapshot: this.model.serialize(),
      events,
    };
    this.outputQueue.enqueue(frame);
    return frame;
  }
}

function resolveSpawner(
  mode: RaidLogicMode,
  mapId: string | undefined,
): NeutralMobSpawner | null | undefined {
  if (mapId) {
    const map = DEFAULT_MAPS.find((m) => m.id === mapId);
    if (map?.mobSpawnerId) {
      return resolveMobSpawner(map.mobSpawnerId) ?? undefined;
    }
  }
  if (mode === "training") return null;
  return undefined;
}

export function createRaidLogicRuntime(
  options: RaidLogicRuntimeOptions,
): RaidLogicRuntime {
  return new BattleRuntime(options.mode, options.loadouts, options.mapId);
}
