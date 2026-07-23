import { DEFAULT_SNAPSHOT_HISTORY } from "@repo/types";
import type { RaidFrameInput } from "../input";
import { FrameSnapshotRing } from "./frame-snapshot-ring";
import {
  deserializeStateFromBytes,
  RaidState,
  serializeStateToBytes,
  type RaidStateSerialized,
} from "./state";

export interface RaidSnapshot {
  readonly frame: number;
  readonly state: RaidStateSerialized;
  readonly hash: number;
}

/**
 * Frame-indexed snapshot history backed by @zakkster/lite-rollback's binary
 * ring buffer. Snapshots are stored as serialized bytes in one preallocated
 * ArrayBuffer; `save` is a ring commit, eviction is implicit in the ring.
 */
export class SnapshotHistory {
  private readonly ring: FrameSnapshotRing;

  constructor(limit = DEFAULT_SNAPSHOT_HISTORY) {
    this.ring = new FrameSnapshotRing({ limit });
  }

  save(snapshot: RaidSnapshot): void {
    this.ring.save(
      snapshot.frame,
      serializeStateToBytes(snapshot.state),
      snapshot.hash,
    );
  }

  get(frame: number): RaidSnapshot | undefined {
    const record = this.ring.get(frame);
    if (!record) {
      return undefined;
    }
    return {
      frame,
      state: deserializeStateFromBytes(record.bytes),
      hash: record.meta,
    };
  }

  clear(): void {
    this.ring.clear();
  }
}

export class InputHistory {
  private readonly inputsByFrame = new Map<number, RaidFrameInput[]>();

  setFrameInputs(frame: number, inputs: readonly RaidFrameInput[]): void {
    this.inputsByFrame.set(frame, inputs.map((input) => ({ ...input })));
  }

  getFrameInputs(frame: number): readonly RaidFrameInput[] {
    return this.inputsByFrame.get(frame) ?? [];
  }
}

export function replayFromSnapshot(
  state: RaidState,
  snapshot: RaidSnapshot,
  targetFrame: number,
  inputHistory: InputHistory,
): void {
  state.deserialize(snapshot.state);

  for (let frame = snapshot.frame; frame < targetFrame; frame += 1) {
    state.step(inputHistory.getFrameInputs(frame));
  }
}
