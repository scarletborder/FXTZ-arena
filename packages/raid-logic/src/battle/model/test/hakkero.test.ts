import { describe, expect, it } from "vitest";
import { HIT_CIRCLE_DIAMETER } from "@repo/constants";

import { createBattleModel, input } from "./helpers";

describe("BattleModel Hakkero", () => {
  it("fires a delayed rear beam on normal fire with a two-second minimum cooldown", async () => {
    const model = await createBattleModel("reimu", "marisa", ["hakkero"]);

    model.step(
      input({
        shootPressed: true,
        aimX: model.target.x,
        aimY: model.target.y,
      }),
    );

    const firstBeams = model.projectiles.filter(
      (projectile) => projectile.kind === "laser",
    );
    expect(firstBeams).toHaveLength(2);

    const preview = firstBeams.find((projectile) => projectile.damage === 0);
    const beam = firstBeams.find((projectile) => projectile.damage === 1);
    expect(preview?.sourceCharacterId).toBe("marisa");
    expect(preview?.renderHeight).toBe(HIT_CIRCLE_DIAMETER * 2);
    expect(preview?.expireAt).toBe(model.frame + 48);
    expect(beam?.sourceCharacterId).toBe("marisa");
    expect(beam?.laserVisualStyle).toBe("th06");
    expect(beam?.laserFramePairStartOffset).toBe(1);
    expect(beam?.laserSpawnTicks).toBe(6);
    expect(beam?.laserDespawnTicks).toBe(6);
    expect(beam?.visibleFrom).toBe(model.frame + 48);
    expect(beam?.damageFrom).toBe(model.frame + 54);
    expect(beam?.damageUntil).toBe(model.frame + 75);
    expect(model.player.hakkeroBeamCooldownUntil).toBe(120);

    model.player.ammo = model.player.ammoCapacity;
    model.step(
      input({
        shootPressed: true,
        aimX: model.target.x,
        aimY: model.target.y,
      }),
    );
    expect(
      model.projectiles.filter((projectile) => projectile.kind === "laser"),
    ).toHaveLength(2);

    for (let frame = 0; frame < 119; frame += 1) {
      model.step(input());
    }
    model.player.ammo = model.player.ammoCapacity;
    model.step(
      input({
        shootPressed: true,
        aimX: model.target.x,
        aimY: model.target.y,
      }),
    );

    expect(
      model.projectiles.filter((projectile) => projectile.kind === "laser"),
    ).toHaveLength(2);
    expect(model.player.hakkeroBeamCooldownUntil).toBe(120);
  });
});
