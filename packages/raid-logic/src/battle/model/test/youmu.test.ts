import { describe, expect, it } from "vitest";
import { secondsToTicks } from "@repo/content";
import { createBattleModel, input, shootOnceAtPoint } from "./helpers";

const YOUMU_BOMB_STARTUP_TICKS = secondsToTicks(0.4);

describe("BattleModel Youmu", () => {
  it("waits in place before executing Youmu bomb dash", async () => {
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

    expect(model.player.x).toBeCloseTo(startX);
    expect(model.player.y).toBeCloseTo(startY);
    expect(model.projectiles).not.toContainEqual(
      expect.objectContaining({ textureKey: "effect_youmu_dash_path" }),
    );
    expect(model.player.youmuBombDashDelayRemaining).toBe(
      YOUMU_BOMB_STARTUP_TICKS,
    );

    for (let frame = 0; frame < YOUMU_BOMB_STARTUP_TICKS - 1; frame += 1) {
      model.step(input());
      expect(model.player.x).toBeCloseTo(startX);
      expect(model.player.y).toBeCloseTo(startY);
    }

    model.step(input());

    const dashPath = model.projectiles.find(
      (projectile) => projectile.textureKey === "effect_youmu_dash_path",
    );
    expect(dashPath).toBeDefined();
    expect(dashPath!.width).toBeCloseTo(cursorDistance);
    expect(dashPath!.x).toBeCloseTo(startX + cursorDistance / 2);
    expect(model.player.x).toBeCloseTo(startX + cursorDistance);
    expect(model.player.y).toBeCloseTo(startY);
  });

  it("locks movement, switching, attacks, and repeat bomb during Youmu bomb startup", async () => {
    const model = await createBattleModel("youmu", "marisa");
    const startX = model.player.x;
    const startY = model.player.y;
    const startBombs = model.player.bombs;

    model.step(input({ bombPressed: true, aimX: startX + 36, aimY: startY }));
    model.step(
      input({
        moveX: 1,
        shootPressed: true,
        bombPressed: true,
        alternateHeld: true,
        aimX: startX + 72,
        aimY: startY,
      }),
    );

    expect(model.player.x).toBeCloseTo(startX);
    expect(model.player.activeCharacter.id).toBe("youmu");
    expect(model.player.shotsFired).toBe(0);
    expect(model.player.bombUses).toBe(1);
    expect(model.player.bombs).toBe(startBombs - 1);
  });

  it("restores pending Youmu bomb startup before rollback dash resolution", async () => {
    const model = await createBattleModel("youmu", "reimu");
    const startX = model.player.x;
    const startY = model.player.y;
    const aimX = startX + 36;
    const aimY = startY;

    model.step(input({ bombPressed: true, aimX, aimY }));
    for (let frame = 0; frame < 8; frame += 1) {
      model.step(input());
    }
    const snapshot = model.serialize();
    const expectedRemaining = model.player.youmuBombDashDelayRemaining;

    const restored = await createBattleModel("youmu", "reimu");
    restored.deserialize(snapshot);

    expect(restored.player.youmuBombDashDelayRemaining).toBe(expectedRemaining);
    expect(restored.player.youmuBombDashStartX).toBeCloseTo(startX);
    expect(restored.player.youmuBombDashStartY).toBeCloseTo(startY);
    expect(restored.player.youmuBombDashAimX).toBeCloseTo(aimX);
    expect(restored.player.youmuBombDashAimY).toBeCloseTo(aimY);

    while (restored.player.youmuBombDashDelayRemaining > 0) {
      restored.step(input());
    }

    expect(restored.player.x).toBeCloseTo(aimX);
    expect(
      restored.projectiles.some(
        (projectile) => projectile.textureKey === "effect_youmu_dash_path",
      ),
    ).toBe(true);
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
