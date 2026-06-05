import { describe, expect, it } from "vitest";
import { createBattleModel, input, shootOnceAtPoint } from "./helpers";

describe("BattleModel Youmu", () => {
  it("keeps Youmu dash path length at the cursor distance when shorter than max range", async () => {
    const model = await createBattleModel("youmu", "reimu");
    const startX = model.player.x;
    const startY = model.player.y;
    const cursorDistance = 36;

    model.step(
      input({
        bombPressed: true,
        aimX: startX + cursorDistance,
        aimY: startY,
      }),
    );

    const dashPath = model.projectiles.find(
      (projectile) => projectile.textureKey === "effect_youmu_dash_path",
    );
    expect(dashPath).toBeDefined();
    expect(dashPath!.width).toBeCloseTo(cursorDistance);
    expect(dashPath!.x).toBeCloseTo(startX + cursorDistance / 2);
    expect(model.player.x).toBeCloseTo(startX + cursorDistance);
    expect(model.player.y).toBeCloseTo(startY);
  });

  it("staggers Youmu slash arcs every eight frames", async () => {
    const model = await shootOnceAtPoint("youmu", 300);
    const slashFrames = model.projectiles
      .filter((projectile) =>
        projectile.textureKey?.startsWith("effect_youmu_slash"),
      )
      .map((projectile) => projectile.visibleFrom)
      .sort((left, right) => left - right);

    expect(slashFrames).toHaveLength(32);
    const arcFrames = [...new Set(slashFrames)];
    expect(arcFrames).toEqual([
      slashFrames[0],
      slashFrames[0]! + 8,
      slashFrames[0]! + 16,
      slashFrames[0]! + 24,
    ]);
    for (const frame of arcFrames) {
      expect(
        slashFrames.filter((slashFrame) => slashFrame === frame),
      ).toHaveLength(8);
    }
  });
});
