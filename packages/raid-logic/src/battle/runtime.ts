import type { BattleLoadouts } from "./loadout";
import { BattleModel } from "./model";
import { BattlePhysics } from "./model/physics-adapter";
import type { BattleModelSnapshot } from "./model/snapshot";
import { BattleOutputQueue, type BattleOutputEvent, type BattleOutputFrame } from "./output";
import type { BattleInputState, BattleOutputState } from "./types";

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
    };

export interface RaidLogicRuntimeOptions {
  readonly mode: RaidLogicMode;
  readonly loadouts?: BattleLoadouts;
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
  ) {
    this.model = new BattleModel(loadouts, {
      endOnTargetDefeat: mode === "ai" || mode === "online",
    });
    this.enqueueOutput([{ type: "snapshot_restored", frame: this.model.frame }]);
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

  step(input: RaidLogicStepInput): BattleOutputFrame {
    if (!this.physicsReady) {
      throw new Error("RaidLogicRuntime must be initialized before stepping");
    }

    if (input.mode !== this.mode) {
      throw new Error(`Cannot step ${this.mode} runtime with ${input.mode} input`);
    }

    if (input.mode === "online") {
      this.model.stepVersus(input.player, input.target);
    } else {
      this.model.step(input.player);
    }

    return this.enqueueOutput([{ type: "frame_advanced", frame: this.model.frame }]);
  }

  reset(): BattleOutputFrame {
    this.model.reset();
    return this.enqueueOutput([{ type: "snapshot_restored", frame: this.model.frame }]);
  }

  serialize(): BattleModelSnapshot {
    return this.model.serialize();
  }

  deserialize(snapshot: BattleModelSnapshot): BattleOutputFrame {
    this.model.deserialize(snapshot);
    return this.enqueueOutput([{ type: "snapshot_restored", frame: this.model.frame }]);
  }

  hash(): number {
    return this.model.hash();
  }

  hashHex(): string {
    return this.model.hashHex();
  }

  private enqueueOutput(events: readonly BattleOutputEvent[]): BattleOutputFrame {
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

export function createRaidLogicRuntime(options: RaidLogicRuntimeOptions): RaidLogicRuntime {
  return new BattleRuntime(options.mode, options.loadouts);
}
