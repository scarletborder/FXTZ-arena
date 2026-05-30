import { describe, expect, it, vi } from "vitest";

vi.mock("phaser", () => ({
  default: {},
}));

import { FIXED_STEP_MS } from "@repo/constants";

import { tweenVisual } from "./tween";

describe("tweenVisual", () => {
  it("kills existing tweens and creates a fixed-step linear tween", () => {
    const killTweensOf = vi.fn();
    const add = vi.fn();
    const scene = {
      tweens: {
        killTweensOf,
        add,
      },
    };
    const target = { x: 0, y: 0, alpha: 1, rotation: 0 };

    tweenVisual(scene as never, target, {
      x: 120,
      y: 80,
      alpha: 0.6,
      rotation: Math.PI / 2,
    });

    expect(killTweensOf).toHaveBeenCalledWith(target);
    expect(add).toHaveBeenCalledWith(
      expect.objectContaining({
        targets: target,
        duration: FIXED_STEP_MS,
        ease: "Linear",
        x: 120,
        y: 80,
        alpha: 0.6,
        rotation: Math.PI / 2,
      }),
    );
  });
});