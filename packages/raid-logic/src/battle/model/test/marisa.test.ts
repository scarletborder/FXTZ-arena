import { describe, expect, it } from "vitest";
import { HIT_CIRCLE_DIAMETER } from "@repo/constants";
import { shootOnceAtPoint } from "./helpers";

describe("BattleModel Marisa", () => {
  it("adds Marisa rear beams and parallel lasers by point tier", async () => {
    const tier1 = await shootOnceAtPoint("marisa", 0);
    expect(tier1.projectiles).toHaveLength(1);
    expect(tier1.projectiles[0]?.kind).toBe("knife");
    expect(tier1.projectiles[0]?.couldClear).toBe(false);

    const tier2 = await shootOnceAtPoint("marisa", 100);
    expect(tier2.projectiles).toHaveLength(5);
    expect(
      tier2.projectiles.filter((projectile) => projectile.damage === 0),
    ).toHaveLength(2);
    const tier2RearBeams = tier2.projectiles
      .filter(
        (projectile) =>
          projectile.kind === "laser" &&
          projectile.damage === 1 &&
          !Number.isFinite(projectile.width),
      )
      .sort((left, right) => left.y - right.y);
    expect(tier2RearBeams).toHaveLength(2);
    expect(tier2RearBeams.map((projectile) => projectile.height)).toEqual([
      HIT_CIRCLE_DIAMETER * 2,
      HIT_CIRCLE_DIAMETER * 2,
    ]);
    expect(tier2RearBeams.map((projectile) => projectile.renderHeight)).toEqual(
      [HIT_CIRCLE_DIAMETER * 2, HIT_CIRCLE_DIAMETER * 2],
    );
    expect(
      tier2RearBeams.map((projectile) => projectile.laserVisualStyle),
    ).toEqual(["th06", "th06"]);
    expect(
      tier2RearBeams.map((projectile) => projectile.laserFramePairStartOffset),
    ).toEqual([1, 1]);
    expect(
      tier2RearBeams.map((projectile) => projectile.laserSpawnTicks),
    ).toEqual([6, 6]);
    expect(
      tier2RearBeams.map((projectile) => projectile.laserDespawnTicks),
    ).toEqual([6, 6]);
    expect(
      tier2RearBeams.map(
        (projectile) => (projectile.damageFrom ?? 0) - projectile.visibleFrom,
      ),
    ).toEqual([6, 6]);
    expect(
      tier2RearBeams.map(
        (projectile) =>
          (projectile.expireAt ?? 0) - (projectile.damageUntil ?? 0),
      ),
    ).toEqual([6, 6]);
    expect(tier2RearBeams.map((projectile) => projectile.x)).toEqual([
      tier2.player.previousX - HIT_CIRCLE_DIAMETER * 16,
      tier2.player.previousX - HIT_CIRCLE_DIAMETER * 16,
    ]);
    expect(tier2RearBeams.map((projectile) => projectile.y)).toEqual([
      tier2.player.previousY - HIT_CIRCLE_DIAMETER * 8,
      tier2.player.previousY + HIT_CIRCLE_DIAMETER * 8,
    ]);

    const tier3 = await shootOnceAtPoint("marisa", 200);
    expect(
      tier3.projectiles.filter((projectile) =>
        Number.isFinite(projectile.width),
      ),
    ).toHaveLength(2);

    const tier4 = await shootOnceAtPoint("marisa", 300);
    expect(tier4.projectiles).toHaveLength(10);
    expect(
      tier4.projectiles.filter((projectile) => projectile.damage === 0),
    ).toHaveLength(4);
    const tier4RearBeams = tier4.projectiles.filter(
      (projectile) =>
        projectile.kind === "laser" &&
        projectile.damage === 1 &&
        !Number.isFinite(projectile.width),
    );
    expect(tier4RearBeams).toHaveLength(4);
    expect(
      tier4RearBeams
        .filter((projectile) => projectile.y < tier4.player.y)
        .map((projectile) => projectile.angle)
        .sort((left, right) => left - right),
    ).toEqual([-Math.PI / 18, 0]);
    expect(
      tier4RearBeams
        .filter((projectile) => projectile.y > tier4.player.y)
        .map((projectile) => projectile.angle)
        .sort((left, right) => left - right),
    ).toEqual([0, Math.PI / 18]);
    expect(
      tier4RearBeams.every(
        (projectile) =>
          projectile.x === tier4.player.previousX - HIT_CIRCLE_DIAMETER * 16,
      ),
    ).toBe(true);
  });
});
