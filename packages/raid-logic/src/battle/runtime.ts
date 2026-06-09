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
import type { BattleRoomMode } from "@repo/types";
import {
  DEFAULT_ARENA_BOUNDS,
  PLAYER_SPAWN,
  TARGET_SPAWN,
  normalizeArenaBounds,
  type ArenaBounds,
  type PointRewardSize,
} from "@repo/constants";
import type { BattleOutputState } from "@repo/content";
import { DEFAULT_MAPS, resolveMobSpawner } from "@repo/content";
import type { MapDefinition, NeutralMobSpawner } from "@repo/content";

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
  readonly battleMode?: BattleRoomMode;
  readonly playerInitPoint?: number;
  readonly opponentInitPoint?: number;
  readonly ai?: {
    readonly smartDurationSeconds?: number;
    readonly dumbRampSeconds?: number;
  };
}

export interface RaidLogicRuntime {
  readonly mode: RaidLogicMode;
  readonly outputQueue: BattleOutputQueue;
  readonly state: BattleOutputState;
  readonly frame: number;
  readonly gameOver: boolean;
  readonly physicsReady: boolean;
  /**
   * True after the most recent step() when the simulation consumed aim
   * coordinates (shoot, bomb, active card, or projectile retarget) in a
   * way that makes the exact aim values material to the output hash.
   * Read by CombatSyncManager to drive the aim-consuming-frames set.
   */
  readonly aimConsumedThisFrame: boolean;
  /** After each step(), the input that was used for the target/opponent fighter. */
  readonly lastTargetInput: BattleInputState | null;
  /** After each step(), the input that was used for the local/player fighter. */
  readonly lastPlayerInput: BattleInputState | null;
  initialize(): Promise<void>;
  readDebugBodies(): ReturnType<BattlePhysics["readAllBodies"]>;
  debugSpawnPoint(params: {
    readonly rewardSize: PointRewardSize;
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
  /** Debug: hash each component separately. */
  hashComponentsDebug(): Record<string, string>;
}

class BattleRuntime implements RaidLogicRuntime {
  readonly outputQueue = new BattleOutputQueue();
  private readonly model: BattleModel;
  private readonly physics: BattlePhysics;
  private initializePromise: Promise<void> | undefined;

  constructor(
    readonly mode: RaidLogicMode,
    loadouts: BattleLoadouts | undefined,
    mapId: string | undefined,
    battleMode: BattleRoomMode | undefined,
    playerInitPoint: number | undefined,
    opponentInitPoint: number | undefined,
    ai: RaidLogicRuntimeOptions["ai"] | undefined,
  ) {
    const map = resolveMap(mapId);
    const bounds = arenaBoundsForMap(map);
    const spawner = resolveSpawner(mode, map);
    const spawnPoints = resolveSpawnPoints(battleMode ?? "versus", map, bounds);
    this.physics = new BattlePhysics(bounds);
    this.model = new BattleModel(loadouts, {
      battleMode: battleMode ?? "versus",
      arenaBounds: bounds,
      playerSpawn: spawnPoints.playerSpawn,
      targetSpawn: spawnPoints.targetSpawn,
      enableCpuTarget: mode === "ai",
      neutralMobSpawner: spawner,
      playerInitPoint,
      opponentInitPoint,
      ai,
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

  get aimConsumedThisFrame(): boolean {
    return this.model.aimConsumedThisFrame;
  }

  get lastTargetInput(): BattleInputState | null {
    return this.model.lastTargetInput;
  }

  get lastPlayerInput(): BattleInputState | null {
    return this.model.lastPlayerInput;
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
    readonly rewardSize: PointRewardSize;
    readonly x: number;
    readonly y: number;
  }): BattleOutputFrame {
    const velocity = pointVelocityFromFrame(this.model.frame, "low");
    this.model.pointManager.addPoint(
      createPointState({
        id: this.model.pointManager.allocatePointId(),
        x: params.x,
        y: params.y,
        rewardSize: params.rewardSize,
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
    this.model.pointManager.setPointCount(this.model.player, pointCount);
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

  hashComponentsDebug(): Record<string, string> {
    return this.model.hashComponentsDebug();
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
  map: MapDefinition | undefined,
): NeutralMobSpawner | null | undefined {
  if (map?.mobSpawnerId) {
    return resolveMobSpawner(map.mobSpawnerId) ?? undefined;
  }
  if (mode === "training") return null;
  return undefined;
}

function resolveMap(mapId: string | undefined): MapDefinition | undefined {
  if (!mapId) return undefined;
  return DEFAULT_MAPS.find((m) => m.id === mapId);
}

function arenaBoundsForMap(map: MapDefinition | undefined): ArenaBounds {
  if (!map) return DEFAULT_ARENA_BOUNDS;
  return normalizeArenaBounds({
    width: map.width,
    height: map.height,
    viewportWidth: map.viewportWidth,
    viewportHeight: map.viewportHeight,
  });
}

function resolveSpawnPoints(
  battleMode: BattleRoomMode,
  map: MapDefinition | undefined,
  bounds: ArenaBounds,
): {
  readonly playerSpawn: { readonly x: number; readonly y: number };
  readonly targetSpawn: { readonly x: number; readonly y: number };
} {
  if (battleMode === "collaborate") {
    const spawn = spawnPointOrDefault(map?.spawnPoints[0], bounds, {
      x: 1200,
      y: 720,
    });
    return {
      playerSpawn: spawn,
      targetSpawn: spawn,
    };
  }
  return {
    playerSpawn: PLAYER_SPAWN,
    targetSpawn: TARGET_SPAWN,
  };
}

function spawnPointOrDefault(
  spawnPoint: { readonly x: number; readonly y: number } | undefined,
  bounds: ArenaBounds,
  fallback: { readonly x: number; readonly y: number },
): { readonly x: number; readonly y: number } {
  if (
    spawnPoint &&
    spawnPoint.x >= 0 &&
    spawnPoint.x <= bounds.width &&
    spawnPoint.y >= 0 &&
    spawnPoint.y <= bounds.height
  ) {
    return spawnPoint;
  }
  return fallback;
}

export function createRaidLogicRuntime(
  options: RaidLogicRuntimeOptions,
): RaidLogicRuntime {
  return new BattleRuntime(
    options.mode,
    options.loadouts,
    options.mapId,
    options.battleMode,
    options.playerInitPoint,
    options.opponentInitPoint,
    options.ai,
  );
}
