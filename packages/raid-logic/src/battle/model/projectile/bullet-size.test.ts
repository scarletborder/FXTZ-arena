import { describe, expect, it } from "vitest";

import {
  bulletRenderSizeForHitSize,
  normalizeBulletHitSize,
  type BulletAssetMetrics,
} from "@repo/content";
import { createBulletProjectile } from "./bullet";

describe("bullet asset sizing", () => {
  it("normalizes mismatched hit sizes by the larger requested axis", () => {
    const metrics: BulletAssetMetrics = {
      rectWidth: 16,
      rectHeight: 16,
      hitWidth: 10,
      hitHeight: 12,
    };

    const size = normalizeBulletHitSize({ width: 5, height: 8 }, metrics);

    expect(size.width).toBeCloseTo((8 / 6) * 5);
    expect(size.height).toBeCloseTo(8);
  });

  it("scales rendered bullet frames from their hit box", () => {
    const metrics: BulletAssetMetrics = {
      rectWidth: 16,
      rectHeight: 16,
      hitWidth: 10,
      hitHeight: 10,
    };

    const size = bulletRenderSizeForHitSize({ width: 10, height: 10 }, metrics);

    expect(size.width).toBeCloseTo(16);
    expect(size.height).toBeCloseTo(16);
  });

  it("applies textureKey hit-box normalization during bullet spawn", () => {
    const projectile = createBulletProjectile({
      id: 1,
      owner: "Player1",
      kind: "orb",
      textureKey: "bullet_type_1_offset_0",
      x: 0,
      y: 0,
      angle: 0,
      speedRank: "low",
      width: 5,
      height: 8,
      frame: 0,
      homingTicks: 0,
    });

    expect(projectile.width).toBe(8);
    expect(projectile.height).toBe(8);
    expect(projectile.previousWidth).toBe(8);
    expect(projectile.renderWidth).toBeCloseTo(12.8);
    expect(projectile.renderHeight).toBeCloseTo(12.8);
  });

  it("carries an explicit tiled laser render mode for laser-textured bullets", () => {
    const projectile = createBulletProjectile({
      id: 1,
      owner: "Player1",
      kind: "knife",
      textureKey: "laser_type_1_offset_13",
      x: 0,
      y: 0,
      angle: 0,
      speedRank: "high",
      width: 96,
      height: 8,
      laserRenderMode: "tiled",
      frame: 0,
      homingTicks: 0,
    });

    expect(projectile.laserRenderMode).toBe("tiled");
    expect(projectile.width).toBe(96);
    expect(projectile.height).toBe(8);
    expect(projectile.renderWidth).toBeUndefined();
    expect(projectile.renderHeight).toBeUndefined();
  });
});
