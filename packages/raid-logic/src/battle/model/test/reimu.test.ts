import { describe, expect, it } from "vitest";
import { bulletSpeedRankToPixelsPerTick } from "@repo/types";
import { HIT_CIRCLE_DIAMETER } from "@repo/constants";
import { clearProjectilesAround } from "../projectile";
import { createBattleModel, input, shootOnceAtPoint } from "./helpers";

describe("BattleModel Reimu", () => {
  it("upgrades Reimu shot counts by point tier", async () => {
    const tier1 = await shootOnceAtPoint("reimu", 0);
    expect(tier1.projectiles).toHaveLength(3);
    expect(
      tier1.projectiles.filter(
        (projectile) => projectile.homingUntil === projectile.homingStartAt,
      ),
    ).toHaveLength(1);

    const tier2 = await shootOnceAtPoint("reimu", 100);
    expect(tier2.projectiles).toHaveLength(4);

    const tier3 = await shootOnceAtPoint("reimu", 200);
    expect(tier3.projectiles).toHaveLength(6);
    expect(
      tier3.projectiles.filter(
        (projectile) => projectile.visibleFrom === tier3.frame + 8,
      ),
    ).toHaveLength(2);

    const tier4 = await shootOnceAtPoint("reimu", 300);
    expect(tier4.projectiles).toHaveLength(8);
    expect(
      tier4.projectiles.filter(
        (projectile) => projectile.visibleFrom === tier4.frame + 8,
      ),
    ).toHaveLength(4);
  });

  it("spawns Reimu bomb orbs immediately and moves them in delayed waves", async () => {
    const model = await createBattleModel("reimu", "marisa");
    model.player.facing = 0;

    model.step(
      input({
        bombPressed: true,
        aimX: model.player.x + 100,
        aimY: model.player.y,
      }),
    );

    const bombOrbs = model.projectiles
      .filter((projectile) => projectile.clearsProjectiles)
      .sort((left, right) => left.angle - right.angle);
    expect(bombOrbs).toHaveLength(5);
    expect(bombOrbs.every((projectile) => projectile.couldClear)).toBe(true);
    expect(bombOrbs.every((projectile) => projectile.piercesTargets)).toBe(
      true,
    );
    expect(
      bombOrbs.every(
        (projectile) => projectile.width === 38 && projectile.height === 38,
      ),
    ).toBe(true);
    expect(
      bombOrbs.filter(
        (projectile) =>
          projectile.visibleFrom === model.frame &&
          projectile.pausedUntil === model.frame + 30 &&
          projectile.retargetAt === model.frame + 30,
      ),
    ).toHaveLength(2);
    expect(
      bombOrbs.filter(
        (projectile) =>
          projectile.visibleFrom === model.frame &&
          projectile.pausedUntil === model.frame + 45 &&
          projectile.retargetAt === model.frame + 45,
      ),
    ).toHaveLength(3);
    expect(
      bombOrbs.map((projectile) =>
        Math.round((projectile.angle * 180) / Math.PI),
      ),
    ).toEqual([-30, 30, 120, 180, 240]);
    expect(
      bombOrbs.every(
        (projectile) =>
          Math.abs(
            Math.hypot(
              projectile.x - model.player.previousX,
              projectile.y - model.player.previousY,
            ) -
              HIT_CIRCLE_DIAMETER * 28,
          ) < 0.001,
      ),
    ).toBe(true);
  });

  it("aims Reimu bomb orbs once at the enemy when delayed movement starts", async () => {
    const model = await createBattleModel("reimu", "marisa");
    model.player.facing = 0;
    model.target.x = model.player.x;
    model.target.y = model.player.y + 200;

    model.step(input({ bombPressed: true }));

    const forwardOrb = model.projectiles.find(
      (projectile) =>
        projectile.clearsProjectiles &&
        projectile.pausedUntil === model.frame + 30,
    );
    expect(forwardOrb).toBeDefined();
    const startX = forwardOrb!.x;
    const startY = forwardOrb!.y;
    expect(forwardOrb!.visibleFrom).toBe(model.frame);

    for (let index = 0; index < 29; index += 1) {
      model.step(input());
    }

    expect(forwardOrb!.x).toBeCloseTo(startX);
    expect(forwardOrb!.y).toBeCloseTo(startY);

    model.target.x = startX;
    model.target.y = startY + 240;
    model.step(input());

    const retargetAngle = Math.atan2(
      model.target.y - startY,
      model.target.x - startX,
    );
    expect(forwardOrb!.retargetAt).toBeUndefined();
    expect(forwardOrb!.angle).toBeCloseTo(retargetAngle);
    const lockedVx = forwardOrb!.vx;
    const lockedVy = forwardOrb!.vy;

    model.target.x = startX + 240;
    model.target.y = startY;
    model.step(input());

    expect(forwardOrb!.vx).toBeCloseTo(lockedVx);
    expect(forwardOrb!.vy).toBeCloseTo(lockedVy);
  });

  it("keeps Reimu bomb orbs after a hit but still allows clearing them", async () => {
    const model = await createBattleModel("reimu", "marisa");
    model.step(input({ bombPressed: true }));

    const bombOrb = model.projectiles.find(
      (projectile) => projectile.clearsProjectiles,
    );
    expect(bombOrb).toBeDefined();
    model.target.x = bombOrb!.x;
    model.target.y = bombOrb!.y;

    model.step(input());

    expect(
      model.projectiles.some((projectile) => projectile.id === bombOrb!.id),
    ).toBe(true);

    clearProjectilesAround(
      model.projectiles,
      bombOrb!.x,
      bombOrb!.y,
      HIT_CIRCLE_DIAMETER * 16,
    );

    expect(
      model.projectiles.some((projectile) => projectile.id === bombOrb!.id),
    ).toBe(false);
  });
});
