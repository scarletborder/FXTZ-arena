import { describe, expect, it } from "vitest";
import { bulletSpeedRankToPixelsPerTick } from "@repo/types";
import { HIT_CIRCLE_DIAMETER } from "@repo/constants";
import { createBattleModel, input, shootOnceAtPoint } from "./helpers";

describe("BattleModel Ellen", () => {
  it("adds Ellen retarget fans and delayed center volley by point tier", async () => {
    const lowBulletSpeed = bulletSpeedRankToPixelsPerTick("low");
    const highBulletSpeed = bulletSpeedRankToPixelsPerTick("high");
    const tier1 = await shootOnceAtPoint("ellen", 0);
    expect(tier1.projectiles).toHaveLength(8);
    expect(
      tier1.projectiles.filter(
        (projectile) => projectile.textureKey === "bullet_type_21_offset_1",
      ),
    ).toHaveLength(2);
    expect(
      tier1.projectiles.filter(
        (projectile) =>
          projectile.textureKey === "bullet_type_24_offset_1" &&
          projectile.vx * projectile.vx + projectile.vy * projectile.vy <
            lowBulletSpeed * lowBulletSpeed + 0.01 &&
          projectile.retargetAt === tier1.frame + 60 &&
          projectile.retargetSpeed === highBulletSpeed,
      ),
    ).toHaveLength(6);
    expect(
      tier1.projectiles.every(
        (projectile) =>
          projectile.couldClear &&
          (projectile.textureKey === "bullet_type_21_offset_1"
            ? projectile.width === 15 && projectile.height === 15
            : projectile.width === 23 && projectile.height === 23),
      ),
    ).toBe(true);

    const tier2 = await shootOnceAtPoint("ellen", 100);
    expect(tier2.projectiles).toHaveLength(14);
    expect(
      tier2.projectiles.filter(
        (projectile) => projectile.retargetAt === tier2.frame + 72,
      ),
    ).toHaveLength(6);

    const tier3 = await shootOnceAtPoint("ellen", 200);
    expect(tier3.projectiles).toHaveLength(20);
    expect(
      tier3.projectiles.filter(
        (projectile) =>
          projectile.textureKey === "bullet_type_21_offset_1" &&
          projectile.visibleFrom === tier3.frame + 8,
      ),
    ).toHaveLength(2);
    expect(
      tier3.projectiles.filter(
        (projectile) =>
          projectile.textureKey === "bullet_type_24_offset_1" &&
          projectile.retargetAt === tier3.frame + 48 &&
          projectile.retargetSpeed === highBulletSpeed,
      ),
    ).toHaveLength(4);

    const tier4 = await shootOnceAtPoint("ellen", 300);
    expect(tier4.projectiles).toHaveLength(26);
    expect(
      tier4.projectiles.filter(
        (projectile) =>
          projectile.retargetAt === tier4.frame + 48 &&
          projectile.retargetSpeed === highBulletSpeed,
      ),
    ).toHaveLength(10);
  });

  it("spawns Ellen bomb clear ring and rotating piercing bullets", async () => {
    const model = await createBattleModel("ellen", "reimu");

    model.step(input({ bombPressed: true }));

    expect(model.clearRings).toHaveLength(1);
    expect(model.clearRings[0]?.radius).toBe(HIT_CIRCLE_DIAMETER * 28);
    const bombBullets = model.projectiles.filter(
      (projectile) => projectile.textureKey === "bullet_type_23_offset_1",
    );
    expect(bombBullets).toHaveLength(3);
    expect(
      bombBullets.every(
        (projectile) =>
          projectile.damage === 2 &&
          projectile.width === 30 &&
          projectile.height === 30 &&
          projectile.couldClear &&
          projectile.piercesTargets &&
          projectile.polarOriginX === model.player.x &&
          projectile.polarOriginY === model.player.y &&
          projectile.polarRadius === 0 &&
          projectile.polarRadialSpeed === bulletSpeedRankToPixelsPerTick("low"),
      ),
    ).toBe(true);
    const polarAngles = bombBullets.map((projectile) => projectile.polarAngle);
    expect(polarAngles[0]).toBeCloseTo(model.player.facing);
    expect(polarAngles[1]).toBeCloseTo(model.player.facing + (Math.PI * 2) / 3);
    expect(polarAngles[2]).toBeCloseTo(model.player.facing + (Math.PI * 4) / 3);

    model.step(input());

    for (const projectile of bombBullets) {
      expect(projectile.polarRadius).toBeCloseTo(
        bulletSpeedRankToPixelsPerTick("low"),
      );
      expect(projectile.x).not.toBe(model.player.x);
    }
  });

  it("replays Ellen polar bomb bullets deterministically after rollback", async () => {
    const model = await createBattleModel("ellen", "reimu");
    model.step(input({ bombPressed: true }));
    const snapshot = model.serialize();
    const snapshotHash = model.hashHex();

    model.step(input());
    model.step(input());
    const originalHash = model.hashHex();
    const originalPolarState = model.projectiles.map((projectile) => ({
      id: projectile.id,
      x: projectile.x,
      y: projectile.y,
      polarRadius: projectile.polarRadius,
      polarAngle: projectile.polarAngle,
    }));

    model.deserialize(snapshot);
    expect(model.hashHex()).toBe(snapshotHash);
    model.step(input());
    model.step(input());

    expect(
      model.projectiles.map((projectile) => ({
        id: projectile.id,
        x: projectile.x,
        y: projectile.y,
        polarRadius: projectile.polarRadius,
        polarAngle: projectile.polarAngle,
      })),
    ).toEqual(originalPolarState);
    expect(model.hashHex()).toBe(originalHash);
  });
});
