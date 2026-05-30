import { describe, expect, it } from "vitest";
import { HIT_CIRCLE_DIAMETER } from "@repo/constants";
import {
  createBattleModel,
  input,
  shootOnceAtPoint,
  testProjectile,
} from "./helpers";

describe("BattleModel Cirno", () => {
  it("adds Cirno rear diamonds, center shot, repeat volley, and triple center by point tier", async () => {
    const tier1 = await shootOnceAtPoint("cirno", 0);
    expect(tier1.projectiles).toHaveLength(2);
    expect(
      tier1.projectiles.every(
        (projectile) =>
          projectile.kind === "diamond" &&
          projectile.width === HIT_CIRCLE_DIAMETER * 2 &&
          projectile.height === HIT_CIRCLE_DIAMETER * 2,
      ),
    ).toBe(true);

    const tier2 = await shootOnceAtPoint("cirno", 100);
    expect(tier2.projectiles).toHaveLength(3);

    const tier3 = await shootOnceAtPoint("cirno", 200);
    expect(tier3.projectiles).toHaveLength(5);
    expect(
      tier3.projectiles.filter(
        (projectile) => projectile.visibleFrom === tier3.frame + 6,
      ),
    ).toHaveLength(2);

    const tier4 = await shootOnceAtPoint("cirno", 300);
    expect(tier4.projectiles).toHaveLength(7);
    expect(
      tier4.projectiles.filter(
        (projectile) => projectile.visibleFrom === tier4.frame,
      ),
    ).toHaveLength(5);
  });

  it("turns nearby clearable enemy projectiles into Cirno high-speed diamonds and spends point bomb cost", async () => {
    const model = await createBattleModel("cirno", "reimu");
    model.setPlayerPointCount(250);
    model.projectiles.push(
      testProjectile({
        id: 100,
        owner: "Player2",
        x: model.player.x + HIT_CIRCLE_DIAMETER * 4,
        y: model.player.y,
      }),
      testProjectile({
        id: 101,
        owner: "Player2",
        x: model.player.x - HIT_CIRCLE_DIAMETER * 4,
        y: model.player.y,
      }),
      testProjectile({
        id: 102,
        owner: "Player2",
        x: model.player.x + HIT_CIRCLE_DIAMETER * 60,
        y: model.player.y,
      }),
      testProjectile({
        id: 103,
        owner: "Player2",
        x: model.player.x,
        y: model.player.y,
        couldClear: false,
      }),
    );

    model.step(input({ bombPressed: true }));

    expect(model.player.pointCount).toBe(100);
    expect(model.projectiles.some((projectile) => projectile.id === 100)).toBe(
      false,
    );
    expect(model.projectiles.some((projectile) => projectile.id === 101)).toBe(
      false,
    );
    expect(model.projectiles.some((projectile) => projectile.id === 102)).toBe(
      true,
    );
    expect(model.projectiles.some((projectile) => projectile.id === 103)).toBe(
      true,
    );

    const converted = model.projectiles.filter(
      (projectile) =>
        projectile.owner === "Player1" && projectile.kind === "diamond",
    );
    expect(converted).toHaveLength(2);
    expect(converted.every((projectile) => projectile.couldClear)).toBe(true);
    expect(converted.some((projectile) => projectile.vx > 0)).toBe(true);
    expect(converted.some((projectile) => projectile.vx < 0)).toBe(true);
  });
});
