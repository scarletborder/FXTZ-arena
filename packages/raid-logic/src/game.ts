import type { BattleConfig } from "@repo/types";
import { blake3 } from "@noble/hashes/blake3.js";
import { bytesToHex, hexToBytes, utf8ToBytes } from "@noble/hashes/utils.js";

import {
  fromLegacyFrameInput,
  decodeInput,
  type RaidFrameInput,
} from "./input";
import {
  InputHistory,
  replayFromSnapshot,
  SnapshotHistory,
  type RaidSnapshot,
} from "./rollback";
import {
  deserializeStateFromBytes,
  RaidState,
  serializeStateToBytes,
} from "./state";

export interface RollbackGameAdapter {
  serialize(): Uint8Array;
  deserialize(data: Uint8Array): void;
  step(inputs: Map<string, Uint8Array>): void;
  hash(): number;
}

export interface ConfirmedFrameHashSample {
  readonly frame: number;
  readonly hashHex: string;
}

export class ConfirmedFrameHashAccumulator {
  private readonly hasher = blake3.create();
  private readonly digestHexByFrame = new Map<number, string>();
  private lastFrame = -1;
  private sampleCount = 0;

  constructor() {
    this.hasher.update(utf8ToBytes("fxtz-arena:confirmed-frame-hash:v1"));
  }

  get lastSampledFrame(): number {
    return this.lastFrame;
  }

  get samples(): number {
    return this.sampleCount;
  }

  addSample(sample: ConfirmedFrameHashSample): void {
    if (!Number.isInteger(sample.frame) || sample.frame < 0) {
      throw new Error(`Invalid confirmed frame hash sample frame: ${sample.frame}`);
    }
    if (sample.frame !== this.lastFrame + 1) {
      throw new Error(`Confirmed frame hash samples must be contiguous: expected ${this.lastFrame + 1}, got ${sample.frame}`);
    }

    this.hasher.update(frameToBytes(sample.frame));
    this.hasher.update(hexToBytes(sample.hashHex));
    this.lastFrame = sample.frame;
    this.sampleCount += 1;
    this.digestHexByFrame.set(sample.frame, bytesToHex(this.hasher.clone().digest()));
  }

  digestHex(frame = this.lastFrame): string {
    if (frame === this.lastFrame) {
      return bytesToHex(this.hasher.clone().digest());
    }

    const digest = this.digestHexByFrame.get(frame);
    if (!digest) {
      throw new Error(`No confirmed frame hash digest available for frame ${frame}`);
    }
    return digest;
  }
}

export class RaidBattle {
  readonly state: RaidState;
  readonly snapshots: SnapshotHistory;
  readonly inputHistory = new InputHistory();

  constructor(
    readonly config: BattleConfig,
    snapshotHistorySize?: number,
  ) {
    this.state = new RaidState(config);
    this.snapshots = new SnapshotHistory(snapshotHistorySize);
    this.saveSnapshot();
  }

  get frame(): number {
    return this.state.frame;
  }

  tick(inputs: readonly RaidFrameInput[] = []): number {
    this.inputHistory.setFrameInputs(this.frame, inputs);
    this.state.step(inputs);
    return this.saveSnapshot().hash;
  }

  rollbackToFrame(frame: number): void {
    const snapshot = this.snapshots.get(frame);
    if (!snapshot) {
      throw new Error(`No snapshot available for frame ${frame}`);
    }

    this.state.deserialize(snapshot.state);
  }

  replayToFrame(targetFrame: number): void {
    const currentFrame = this.frame;
    if (targetFrame < currentFrame) {
      throw new Error(`Cannot replay backwards from ${currentFrame} to ${targetFrame}`);
    }

    for (let frame = currentFrame; frame < targetFrame; frame += 1) {
      this.state.step(this.inputHistory.getFrameInputs(frame));
      this.saveSnapshot();
    }
  }

  restoreAndReplay(frame: number, targetFrame: number): void {
    const snapshot = this.snapshots.get(frame);
    if (!snapshot) {
      throw new Error(`No snapshot available for frame ${frame}`);
    }

    replayFromSnapshot(this.state, snapshot, targetFrame, this.inputHistory);
    this.saveSnapshot();
  }

  serialize(): Uint8Array {
    return serializeStateToBytes(this.state.serialize());
  }

  deserialize(data: Uint8Array): void {
    this.state.deserialize(deserializeStateFromBytes(data));
    this.saveSnapshot();
  }

  hash(): number {
    return this.state.hash();
  }

  snapshot(): RaidSnapshot {
    return {
      frame: this.frame,
      state: this.state.serialize(),
      hash: this.hash(),
    };
  }

  createRollbackAdapter(): RollbackGameAdapter {
    return {
      serialize: () => this.serialize(),
      deserialize: (data) => {
        this.deserialize(data);
      },
      step: (inputs) => {
        const decodedInputs = this.config.players.map((player) =>
          decodeInput(
            this.frame,
            player.playerId,
            inputs.get(player.playerId as string),
          ),
        );
        this.tick(decodedInputs);
      },
      hash: () => this.hash(),
    };
  }

  private saveSnapshot(): RaidSnapshot {
    const snapshot = this.snapshot();
    this.snapshots.save(snapshot);
    return snapshot;
  }
}

export function createRaidBattle(
  config: BattleConfig,
  snapshotHistorySize?: number,
): RaidBattle {
  return new RaidBattle(config, snapshotHistorySize);
}

export function advanceFixedTick(
  battle: RaidBattle,
  inputs: Parameters<typeof fromLegacyFrameInput>[0][] = [],
): RaidBattle {
  battle.tick(inputs.map(fromLegacyFrameInput));
  return battle;
}

export function createRollbackAdapter(battle: RaidBattle): RollbackGameAdapter {
  return battle.createRollbackAdapter();
}

function frameToBytes(frame: number): Uint8Array {
  const bytes = new Uint8Array(8);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, frame >>> 0, true);
  view.setUint32(4, Math.floor(frame / 0x100000000), true);
  return bytes;
}
