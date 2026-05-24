import { DEFAULT_SNAPSHOT_HISTORY } from "@repo/types";
import type { RaidFrameInput } from "./input";
import { RaidState, type RaidStateSerialized } from "./state";

export interface RaidSnapshot {
  readonly frame: number;
  readonly state: RaidStateSerialized;
  readonly hash: number;
}

export class SnapshotHistory {
  private readonly snapshots = new Map<number, RaidSnapshot>();

  constructor(private readonly limit = DEFAULT_SNAPSHOT_HISTORY) {}

  save(snapshot: RaidSnapshot): void {
    this.snapshots.set(snapshot.frame, snapshot);
    const frames = Array.from(this.snapshots.keys()).sort(
      (left, right) => left - right,
    );
    while (frames.length > this.limit) {
      const frame = frames.shift();
      if (frame !== undefined) {
        this.snapshots.delete(frame);
      }
    }
  }

  get(frame: number): RaidSnapshot | undefined {
    return this.snapshots.get(frame);
  }

  clear(): void {
    this.snapshots.clear();
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
