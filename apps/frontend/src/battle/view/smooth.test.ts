import { describe, expect, it } from "vitest";

import { smoothPointWithMaxStep, smoothValue, smoothValueWithMaxStep } from "./smooth";

describe("smoothValue", () => {
  it("moves a current value toward the target by the blend factor", () => {
    expect(smoothValue(10, 20, 0)).toBe(10);
    expect(smoothValue(10, 20, 0.5)).toBe(15);
    expect(smoothValue(10, 20, 1)).toBe(20);
  });
});

describe("smoothValueWithMaxStep", () => {
  it("caps one-dimensional movement per frame", () => {
    expect(smoothValueWithMaxStep(0, 100, 24, 4)).toBe(24);
    expect(smoothValueWithMaxStep(100, 0, 24, 4)).toBe(76);
  });

  it("snaps imperceptible one-dimensional offsets", () => {
    expect(smoothValueWithMaxStep(10, 13, 24, 4)).toBe(13);
  });
});

describe("smoothPointWithMaxStep", () => {
  it("caps two-dimensional movement by vector distance", () => {
    const next = smoothPointWithMaxStep(0, 0, 100, 100, 24, 4);

    expect(Math.hypot(next.x, next.y)).toBeCloseTo(24);
  });

  it("moves toward the target without overshooting", () => {
    expect(smoothPointWithMaxStep(0, 0, 30, 0, 24, 4)).toEqual({ x: 15, y: 0 });
    expect(smoothPointWithMaxStep(0, 0, 100, 0, 24, 4)).toEqual({ x: 24, y: 0 });
  });

  it("snaps imperceptible two-dimensional offsets", () => {
    expect(smoothPointWithMaxStep(10, 20, 12, 23, 24, 4)).toEqual({ x: 12, y: 23 });
  });
});
