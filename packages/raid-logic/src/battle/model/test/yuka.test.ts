import { describe, expect, it } from "vitest";
import { TICK_RATE } from "@repo/types";
import { createBattleModel, input, shootOnceAtPoint } from "./helpers";

const FAST_TEXTURE = "bullet_type_6_offset_10";
const BOMB_TEXTURE = "bullet_type_3_offset_0";

describe("BattleModel Yuka", () => {
  it("defines a cost-5 fast sniper with one round and a two-second reload", async () => {
    const model = await createBattleModel("yuka", "reimu");
    const character = model.player.activeCharacter;

    expect(character.cost).toBe(5);
    expect(character.roleClass).toBe("sniper");
    expect(character.moveSpeed).toBe("high");
    expect(character.ammoCapacity).toBe(1);
    expect(character.reloadTicksPerAmmo).toBe(TICK_RATE * 2);
    expect(character.reloadStartPolicy).toBe("reset_to_zero");
    expect(character.reloadCommitPolicy).toBe("commit_on_finish");
  });

  it("upgrades its aimed laser and side bullets across point tiers", async () => {
    const tier1 = await shootOnceAtPoint("yuka", 0);
    expect(damagingLasers(tier1)).toHaveLength(0);
    expect(
      tier1.projectiles.filter((projectile) => projectile.damage === 0),
    ).toHaveLength(1);
    step(tier1, 24);
    expect(damagingLasers(tier1)).toHaveLength(1);
    expect(damagingLasers(tier1)[0]).toMatchObject({
      damage: 2,
      laserVisualStyle: "th06",
    });
    expect(damagingLasers(tier1)[0]!.expireAt! - tier1.frame).toBe(60);

    const tier2 = await shootOnceAtPoint("yuka", 100);
    const tier2Fast = tier2.projectiles.filter(
      (projectile) => projectile.textureKey === FAST_TEXTURE,
    );
    expect(tier2Fast).toHaveLength(2);
    expect(tier2Fast.map((projectile) => projectile.damage)).toEqual([20, 20]);
    expect(roundedAngles(tier2Fast)).toEqual([-20, 20]);

    const tier3 = await shootOnceAtPoint("yuka", 200);
    step(tier3, 24);
    const tier3Lasers = damagingLasers(tier3);
    expect(tier3Lasers).toHaveLength(2);
    expect(relativeSideOffsets(tier3, tier3Lasers)).toEqual([-16, 16]);

    const tier4 = await shootOnceAtPoint("yuka", 300);
    const seenFast = collectSpawned(tier4, FAST_TEXTURE, 8);
    expect(seenFast).toHaveLength(4);
    expect(relativeSpawnFrames(seenFast)).toEqual([0, 8]);
  });

  it("fires alternating tangent rows around a shrinking aim ring", async () => {
    const model = await createBattleModel("yuka", "reimu");
    const aim = { x: 640, y: 120 };
    model.step(input({ bombPressed: true, aimX: aim.x, aimY: aim.y }));
    expect(model.effects).toMatchObject([{ kind: "ring", scale: 0.96 }]);

    const spawned = collectSpawned(model, BOMB_TEXTURE, 120);
    const tangent = spawned.filter((projectile) => projectile.damage === 5);
    const selfRings = spawned.filter((projectile) => projectile.damage === 10);

    expect(tangent).toHaveLength(4 * 8 * 6);
    expect(relativeSpawnFrames(tangent)).toEqual([0, 12, 24, 36]);
    expect(selfRings).toHaveLength(6 * 24);
    expect(relativeSpawnFrames(selfRings)).toEqual([0, 24, 48, 72, 96, 120]);
    expect(spawnRadiusByFrame(tangent, aim)).toEqual([96, 76, 57, 37]);
  });
});

function step(
  model: Awaited<ReturnType<typeof shootOnceAtPoint>>,
  count: number,
) {
  for (let index = 0; index < count; index += 1) model.step(input());
}

function damagingLasers(model: Awaited<ReturnType<typeof shootOnceAtPoint>>) {
  return model.projectiles.filter(
    (projectile) => projectile.kind === "laser" && projectile.damage === 2,
  );
}

function roundedAngles(projectiles: readonly { readonly angle: number }[]) {
  return projectiles
    .map((projectile) => Math.round((projectile.angle * 180) / Math.PI))
    .sort((left, right) => left - right);
}

function relativeSideOffsets(
  model: Awaited<ReturnType<typeof shootOnceAtPoint>>,
  projectiles: readonly { readonly y: number }[],
) {
  return projectiles
    .map((projectile) => Math.round(projectile.y - model.player.previousY))
    .sort((left, right) => left - right);
}

function collectSpawned(
  model: Awaited<ReturnType<typeof createBattleModel>>,
  textureKey: string,
  frames: number,
) {
  const seen = new Map<number, (typeof model.projectiles)[number]>();
  for (let frame = 0; frame <= frames; frame += 1) {
    for (const projectile of model.projectiles) {
      if (projectile.textureKey === textureKey && !seen.has(projectile.id)) {
        seen.set(projectile.id, { ...projectile });
      }
    }
    if (frame < frames) model.step(input());
  }
  return Array.from(seen.values());
}

function relativeSpawnFrames(
  projectiles: readonly { readonly visibleFrom: number }[],
) {
  const first = Math.min(
    ...projectiles.map((projectile) => projectile.visibleFrom),
  );
  return Array.from(
    new Set(projectiles.map((projectile) => projectile.visibleFrom - first)),
  ).sort((left, right) => left - right);
}

function spawnRadiusByFrame(
  projectiles: readonly {
    readonly x: number;
    readonly y: number;
    readonly visibleFrom: number;
  }[],
  aim: { readonly x: number; readonly y: number },
) {
  const firstFrame = Math.min(
    ...projectiles.map((projectile) => projectile.visibleFrom),
  );
  return [0, 12, 24, 36].map((frame) => {
    const volley = projectiles.filter(
      (projectile) => projectile.visibleFrom - firstFrame === frame,
    );
    return Math.round(
      Math.min(
        ...volley.map((projectile) =>
          Math.hypot(projectile.x - aim.x, projectile.y - aim.y),
        ),
      ),
    );
  });
}
