import {
  ConfirmedFrameHashAccumulator,
  stableHash,
  type BattleInputState,
  type DeterministicHasher,
} from "@repo/raid-logic";

import type { ReplayFrame } from "./types";

export function hashReplayFrameInputsHex(frame: ReplayFrame): string {
  const hash = stableHash((hasher) => {
    hasher.writeString("fxtz-arena:authoritative-input:v1");
    hasher.writeNumber(frame.frame);
    writeReplayInputHash(hasher, frame.player1);
    writeReplayInputHash(hasher, frame.player2);
  });
  return hash.toString(16).padStart(8, "0");
}

export function finalReplayInputHash(frames: readonly ReplayFrame[]): string | null {
  if (frames.length === 0) {
    return null;
  }
  const accumulator = new ConfirmedFrameHashAccumulator();
  let sampleFrame = 0;
  let previousReplayFrame = -1;
  for (const frame of frames) {
    if (frame.frame <= previousReplayFrame) {
      return null;
    }
    accumulator.addSample({
      frame: sampleFrame,
      hashHex: hashReplayFrameInputsHex(frame),
    });
    previousReplayFrame = frame.frame;
    sampleFrame += 1;
  }
  return accumulator.digestHex();
}

function writeReplayInputHash(
  hasher: DeterministicHasher,
  input: BattleInputState,
): void {
  hasher.writeNumber(input.moveX);
  hasher.writeNumber(input.moveY);
  hasher.writeNumber(Math.trunc(input.aimX));
  hasher.writeNumber(Math.trunc(input.aimY));
  hasher.writeNumber(input.shootPressed ? 1 : 0);
  hasher.writeNumber(input.bombPressed ? 1 : 0);
  hasher.writeNumber(input.activeCardPressed ? 1 : 0);
  hasher.writeNumber(input.reloadPressed ? 1 : 0);
  hasher.writeNumber(input.alternateHeld ? 1 : 0);
  hasher.writeNumber(input.infoHeld ? 1 : 0);
}
