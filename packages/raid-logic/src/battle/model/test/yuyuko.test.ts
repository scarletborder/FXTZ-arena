import { describe, expect, it } from "vitest";
import { HIT_CIRCLE_DIAMETER } from "@repo/constants";
import { createBattleModel, input, shootOnceAtPoint } from "./helpers";

describe("BattleModel Yuyuko", () => {
  it("fires butterfly spreads and wingman shots by point tier", async () => {
    const tier1 = await shootOnceAtPoint("yuyuko", 0);
    expect(tier1.projectiles).toHaveLength(4);
    expect(tier1.projectiles.map((projectile) => projectile.damage).sort()).toEqual([
      20, 20, 40, 40,
    ]);
    expect(tier1.projectiles.map((projectile) => projectile.textureKey).sort()).toEqual([
      "bullet_type_19_offset_3",
      "bullet_type_19_offset_3",
      "bullet_type_19_offset_4",
      "bullet_type_19_offset_4",
    ]);

    const tier2 = await shootOnceAtPoint("yuyuko", 100);
    expect(tier2.projectiles).toHaveLength(6);
    expect(tier2.projectiles.filter((projectile) => projectile.damage === 20)).toHaveLength(4);
    expect(tier2.projectiles.filter((projectile) => projectile.textureKey === "bullet_type_19_offset_2")).toHaveLength(2);

    const tier3 = await shootOnceAtPoint("yuyuko", 200);
    expect(tier3.projectiles).toHaveLength(8);
    expect(tier3.projectiles.filter((projectile) => projectile.damage === 15)).toHaveLength(4);

    const tier4 = await shootOnceAtPoint("yuyuko", 300);
    expect(tier4.projectiles).toHaveLength(12);
    expect(tier4.projectiles.filter((projectile) => projectile.damage === 10)).toHaveLength(8);
  });

  it("creates bomb preview lasers, delayed lasers, and butterfly bursts", async () => {
    const model = await createBattleModel("yuyuko", "reimu");
    model.step(
      input({
        bombPressed: true,
        aimX: model.target.x,
        aimY: model.target.y,
      }),
    );

    const previews = model.projectiles.filter(
      (projectile) => projectile.kind === "laser" && projectile.damage === 0,
    );
    const lasers = model.projectiles.filter(
      (projectile) => projectile.kind === "laser" && projectile.damage === 3,
    );
    const centerBullets = model.projectiles.filter(
      (projectile) => projectile.kind === "orb" && projectile.damage === 20,
    );
    const sideBullets = model.projectiles.filter(
      (projectile) => projectile.kind === "orb" && projectile.damage === 10,
    );

    expect(previews).toHaveLength(2);
    expect(lasers).toHaveLength(2);
    expect(centerBullets).toHaveLength(42);
    expect(sideBullets).toHaveLength(40);
    expect(model.player.actionLockedUntil).toBe(60);
    expect(previews.map((projectile) => projectile.expireAt)).toEqual([61, 61]);
    expect(lasers.map((projectile) => projectile.visibleFrom)).toEqual([61, 61]);
    expect(lasers.map((projectile) => projectile.damageUntil)).toEqual([187, 187]);
    expect(lasers.every((projectile) => projectile.clearsProjectiles)).toBe(true);
    expect(lasers.every((projectile) => projectile.piercesTargets)).toBe(true);
    expect(lasers.every((projectile) => projectile.textureKey === "laser_type_1_offset_4")).toBe(true);
    expect(centerBullets[0]?.pausedUntil).toBe(61);
    expect(sideBullets[sideBullets.length - 1]?.pausedUntil).toBe(97);
    expect(model.effects[0]?.expireAt).toBe(41);
    expect(model.effects[0]?.scale).toBeCloseTo((HIT_CIRCLE_DIAMETER * 32) / 100);
  });
});
