import type { BattleOutputFrame } from "@repo/types";

export type { BattleOutputEvent, BattleOutputFrame } from "@repo/types";

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
