import type { BattleModelSnapshot } from "./model/snapshot";
import type { BattleOutputState } from "@repo/content";

export type BattleOutputEvent =
  | {
      readonly type: "snapshot_restored";
      readonly frame: number;
    }
  | {
      readonly type: "frame_advanced";
      readonly frame: number;
    };

export interface BattleOutputFrame {
  readonly frame: number;
  readonly hash: number;
  readonly hashHex: string;
  readonly state: BattleOutputState;
  readonly snapshot: BattleModelSnapshot;
  readonly events: readonly BattleOutputEvent[];
}

export class BattleOutputQueue {
  private readonly frames: BattleOutputFrame[] = [];

  enqueue(frame: BattleOutputFrame): void {
    this.frames.push(frame);
  }

  drain(consumer: (frame: BattleOutputFrame) => void): void {
    while (this.frames.length > 0) {
      consumer(this.frames.shift()!);
    }
  }

  drainAll(): BattleOutputFrame[] {
    return this.frames.splice(0, this.frames.length);
  }

  peekLatest(): BattleOutputFrame | undefined {
    return this.frames[this.frames.length - 1];
  }

  clear(): void {
    this.frames.length = 0;
  }
}
