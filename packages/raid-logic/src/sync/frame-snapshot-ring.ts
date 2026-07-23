import { createRollback, type Rollback } from "@zakkster/lite-rollback";

/**
 * Field layout for one ring slot:
 * - `frame`: the simulation frame the snapshot belongs to.
 * - `size`:  payload byte length actually used inside `data`.
 * - `meta`:  caller-defined uint32 (e.g. a state hash).
 * - `data`:  serialized snapshot bytes (fixed-length region, `size` gates reads).
 */
type SnapshotRingFields = {
  frame: Uint32Array;
  size: Uint32Array;
  meta: Uint32Array;
  data: Uint8Array;
};

export interface FrameSnapshotRingOptions {
  /**
   * Logical maximum number of retained snapshots. The underlying
   * lite-rollback ring capacity is the next power of two.
   */
  readonly limit: number;
  /** Initial byte budget per slot; grows (x2) when a snapshot doesn't fit. */
  readonly initialDataBytes?: number;
}

export interface FrameSnapshotRecord {
  /**
   * View into the ring slot (zero-copy). Valid only until the next
   * `save()` call — decode/copy immediately, never mutate.
   */
  readonly bytes: Uint8Array;
  readonly meta: number;
}

const DEFAULT_INITIAL_DATA_BYTES = 4096;

/**
 * Frame-indexed binary snapshot store backed by @zakkster/lite-rollback's
 * zero-GC ring buffer. Replaces the previous Map-based snapshot histories:
 * one preallocated ArrayBuffer holds all slots, a save is one memcpy-style
 * commit and pruning is a ring rollback (slot discard) — no per-frame Map
 * churn and bounded memory.
 *
 * Invariant: stored frames are strictly increasing from oldest to newest
 * commit. `save()` enforces this by discarding any commits whose frame is
 * `>=` the incoming frame before committing (Map "overwrite" semantics).
 */
export class FrameSnapshotRing {
  private readonly limit: number;
  private readonly capacity: number;
  private dataBytes: number;
  private ring: Rollback<SnapshotRingFields>;

  constructor(options: FrameSnapshotRingOptions) {
    if (!Number.isInteger(options.limit) || options.limit < 1) {
      throw new RangeError(
        `FrameSnapshotRing limit must be a positive integer, got ${options.limit}`,
      );
    }
    this.limit = options.limit;
    this.capacity = nextPowerOfTwo(options.limit);
    this.dataBytes = Math.max(
      1,
      options.initialDataBytes ?? DEFAULT_INITIAL_DATA_BYTES,
    );
    this.ring = buildRing(this.capacity, this.dataBytes);
  }

  depth(): number {
    return Math.min(this.ring.depth(), this.limit);
  }

  latestFrame(): number {
    return this.ring.depth() > 0 ? this.ring.peek(0).frame[0]! : -1;
  }

  save(frame: number, bytes: Uint8Array, meta = 0): void {
    if (!Number.isInteger(frame) || frame < 0) {
      throw new RangeError(`Snapshot frame must be a non-negative integer, got ${frame}`);
    }
    if (bytes.length > this.dataBytes) {
      this.grow(bytes.length);
    }
    this.discardWhile((slotFrame) => slotFrame >= frame);

    const live = this.ring.fields;
    live.frame[0] = frame;
    live.size[0] = bytes.length;
    live.meta[0] = meta >>> 0;
    live.data.set(bytes);
    this.ring.commit();
  }

  has(frame: number): boolean {
    return this.indexOf(frame) >= 0;
  }

  get(frame: number): FrameSnapshotRecord | undefined {
    const index = this.indexOf(frame);
    if (index < 0) {
      return undefined;
    }
    const slot = this.ring.peek(index);
    return {
      bytes: slot.data.subarray(0, slot.size[0]!),
      meta: slot.meta[0]!,
    };
  }

  /** Discard every stored snapshot with a frame strictly greater than `frame`. */
  pruneAfter(frame: number): void {
    this.discardWhile((slotFrame) => slotFrame > frame);
  }

  clear(): void {
    this.ring.reset();
  }

  private indexOf(frame: number): number {
    const depth = this.depth();
    if (depth === 0) {
      return -1;
    }
    const headFrame = this.ring.peek(0).frame[0]!;
    if (frame > headFrame) {
      return -1;
    }
    // Frames are usually contiguous, so try direct indexing first.
    const guess = headFrame - frame;
    if (guess < depth && this.ring.peek(guess).frame[0] === frame) {
      return guess;
    }
    for (let index = 0; index < depth; index += 1) {
      const slotFrame = this.ring.peek(index).frame[0]!;
      if (slotFrame === frame) {
        return index;
      }
      if (slotFrame < frame) {
        // Frames decrease monotonically with index; no match possible.
        return -1;
      }
    }
    return -1;
  }

  private discardWhile(predicate: (slotFrame: number) => boolean): void {
    const depth = this.ring.depth();
    let count = 0;
    while (count < depth && predicate(this.ring.peek(count).frame[0]!)) {
      count += 1;
    }
    if (count === 0) {
      return;
    }
    if (count === depth) {
      this.ring.reset();
      return;
    }
    this.ring.rollback(count);
  }

  private grow(minBytes: number): void {
    let nextBytes = this.dataBytes;
    while (nextBytes < minBytes) {
      nextBytes *= 2;
    }
    const next = buildRing(this.capacity, nextBytes);
    const depth = this.ring.depth();
    for (let index = depth - 1; index >= 0; index -= 1) {
      const slot = this.ring.peek(index);
      next.fields.frame[0] = slot.frame[0]!;
      next.fields.size[0] = slot.size[0]!;
      next.fields.meta[0] = slot.meta[0]!;
      next.fields.data.set(slot.data.subarray(0, slot.size[0]!));
      next.commit();
    }
    this.ring = next;
    this.dataBytes = nextBytes;
  }
}

function buildRing(
  capacity: number,
  dataBytes: number,
): Rollback<SnapshotRingFields> {
  return createRollback({
    capacity,
    fields: {
      frame: { type: Uint32Array, length: 1 },
      size: { type: Uint32Array, length: 1 },
      meta: { type: Uint32Array, length: 1 },
      data: { type: Uint8Array, length: dataBytes },
    },
  });
}

function nextPowerOfTwo(value: number): number {
  let result = 1;
  while (result < value) {
    result *= 2;
  }
  return result;
}
