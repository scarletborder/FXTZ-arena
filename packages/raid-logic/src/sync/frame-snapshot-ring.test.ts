import { describe, expect, it } from "vitest";

import { FrameSnapshotRing } from "./frame-snapshot-ring";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function payload(text: string): Uint8Array {
  return encoder.encode(text);
}

function readText(ring: FrameSnapshotRing, frame: number): string | undefined {
  const record = ring.get(frame);
  return record ? decoder.decode(record.bytes) : undefined;
}

describe("FrameSnapshotRing", () => {
  it("stores and retrieves snapshots by frame", () => {
    const ring = new FrameSnapshotRing({ limit: 8 });

    ring.save(0, payload("zero"), 10);
    ring.save(1, payload("one"), 11);
    ring.save(2, payload("two"), 12);

    expect(readText(ring, 0)).toBe("zero");
    expect(readText(ring, 1)).toBe("one");
    expect(readText(ring, 2)).toBe("two");
    expect(ring.get(1)?.meta).toBe(11);
    expect(ring.get(3)).toBeUndefined();
    expect(ring.latestFrame()).toBe(2);
    expect(ring.depth()).toBe(3);
  });

  it("overwrites a re-saved frame and discards newer frames", () => {
    const ring = new FrameSnapshotRing({ limit: 8 });
    for (let frame = 0; frame <= 5; frame += 1) {
      ring.save(frame, payload(`f${frame}`));
    }

    ring.save(3, payload("rewritten"));

    expect(readText(ring, 3)).toBe("rewritten");
    expect(ring.get(4)).toBeUndefined();
    expect(ring.get(5)).toBeUndefined();
    expect(readText(ring, 2)).toBe("f2");
    expect(ring.latestFrame()).toBe(3);
  });

  it("prunes frames after a given frame", () => {
    const ring = new FrameSnapshotRing({ limit: 8 });
    for (let frame = 0; frame <= 5; frame += 1) {
      ring.save(frame, payload(`f${frame}`));
    }

    ring.pruneAfter(2);

    expect(readText(ring, 2)).toBe("f2");
    expect(ring.get(3)).toBeUndefined();
    expect(ring.latestFrame()).toBe(2);

    ring.pruneAfter(-1);
    expect(ring.depth()).toBe(0);
    expect(ring.latestFrame()).toBe(-1);
  });

  it("evicts snapshots older than the limit", () => {
    const ring = new FrameSnapshotRing({ limit: 4 });
    for (let frame = 0; frame < 10; frame += 1) {
      ring.save(frame, payload(`f${frame}`));
    }

    expect(ring.depth()).toBe(4);
    expect(ring.get(5)).toBeUndefined();
    expect(readText(ring, 6)).toBe("f6");
    expect(readText(ring, 9)).toBe("f9");
  });

  it("grows the slot size when a snapshot does not fit", () => {
    const ring = new FrameSnapshotRing({ limit: 4, initialDataBytes: 8 });
    ring.save(0, payload("tiny"));
    const large = "x".repeat(1000);

    ring.save(1, payload(large));

    expect(readText(ring, 0)).toBe("tiny");
    expect(readText(ring, 1)).toBe(large);
  });

  it("clears all snapshots", () => {
    const ring = new FrameSnapshotRing({ limit: 4 });
    ring.save(0, payload("zero"));

    ring.clear();

    expect(ring.get(0)).toBeUndefined();
    expect(ring.depth()).toBe(0);

    ring.save(0, payload("again"));
    expect(readText(ring, 0)).toBe("again");
  });

  it("rejects invalid limits and frames", () => {
    expect(() => new FrameSnapshotRing({ limit: 0 })).toThrow(RangeError);
    const ring = new FrameSnapshotRing({ limit: 4 });
    expect(() => ring.save(-1, payload("bad"))).toThrow(RangeError);
    expect(() => ring.save(1.5, payload("bad"))).toThrow(RangeError);
  });
});
