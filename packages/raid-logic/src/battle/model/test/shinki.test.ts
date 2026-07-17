import { describe, expect, it } from "vitest";
import { TICK_RATE } from "@repo/types";
import { createBattleModel, input, shootOnceAtPoint } from "./helpers";

const NORMAL_TEXTURE = "bullet_type_5_offset_2";
const LARGE_ORB_TEXTURE = "bullet_type_23_offset_0";
const BOMB_FAST_TEXTURE = "bullet_type_26_offset_3";
const BOMB_HOMING_TEXTURE = "bullet_type_28_offset_6";

describe("BattleModel Shinki", () => {
  it("defines a cost-5 suppression character with four rounds and per-round reload", async () => {
    const model = await createBattleModel("shinki", "reimu");
    const character = model.player.activeCharacter;

    expect(character.cost).toBe(5);
    expect(character.roleClass).toBe("suppress");
    expect(character.ammoCapacity).toBe(4);
    expect(character.reloadTicksPerAmmo).toBe(TICK_RATE);
    expect(character.reloadStartPolicy).toBe("keep_current");
    expect(character.reloadCommitPolicy).toBe("commit_per_ammo");
  });

  it("fires familiar spreads and upgrades their beams by point tier", async () => {
    const tier1 = await shootOnceAtPoint("shinki", 0);
    const tier1Bullets = tier1.projectiles.filter(
      (projectile) => projectile.textureKey === NORMAL_TEXTURE,
    );
    expect(tier1Bullets).toHaveLength(8);
    expect(new Set(tier1Bullets.map((projectile) => projectile.damage))).toEqual(
      new Set([40]),
    );
    expect(relativeSpawnFrames(tier1Bullets)).toEqual([0, 8]);
    expect(relativeSideOffsets(tier1, tier1Bullets)).toEqual([-32, 32]);
    expect(roundedAngles(tier1Bullets)).toEqual([-60, -30, 30, 60]);

    const tier2 = await shootOnceAtPoint("shinki", 100);
    const tier2Beams = damagingBeams(tier2);
    expect(tier2.projectiles).toHaveLength(12);
    expect(tier2Beams).toHaveLength(2);
    expect(tier2Beams.map((beam) => beam.damage)).toEqual([3, 3]);
    expect(tier2Beams.map((beam) => beam.damageUntil! - beam.damageFrom!)).toEqual(
      [10, 10],
    );
    expect(tier2Beams.map((beam) => beam.damageFrom! - beam.visibleFrom)).toEqual(
      [6, 6],
    );
    expect(tier2Beams.map((beam) => beam.laserSpawnTicks)).toEqual([6, 6]);
    expect(tier2Beams.map((beam) => beam.laserDespawnTicks)).toEqual([6, 6]);

    const tier3 = await shootOnceAtPoint("shinki", 200);
    const tier3Bullets = tier3.projectiles.filter(
      (projectile) => projectile.textureKey === NORMAL_TEXTURE,
    );
    const tier3Beams = damagingBeams(tier3);
    expect(tier3.projectiles).toHaveLength(24);
    expect(relativeSideOffsets(tier3, tier3Bullets)).toEqual([-72, -24, 24, 72]);
    expect(new Set(tier3Bullets.map((projectile) => projectile.damage))).toEqual(
      new Set([30]),
    );
    expect(tier3Beams).toHaveLength(4);
    expect(new Set(tier3Beams.map((beam) => beam.damage))).toEqual(new Set([2]));

    const tier4 = await shootOnceAtPoint("shinki", 300);
    const tier4LargeOrbs = tier4.projectiles.filter(
      (projectile) => projectile.textureKey === LARGE_ORB_TEXTURE,
    );
    expect(tier4.projectiles).toHaveLength(26);
    expect(tier4LargeOrbs).toHaveLength(2);
    expect(tier4LargeOrbs.map((projectile) => projectile.damage)).toEqual([50, 50]);
    expect(tier4LargeOrbs.every((projectile) => projectile.kind === "orb")).toBe(
      true,
    );
    expect(tier4LargeOrbs.every((projectile) => Math.hypot(projectile.vx, projectile.vy) > 8)).toBe(true);
  });

  it("spawns bomb volleys incrementally instead of allocating the full barrage upfront", async () => {
    const model = await createBattleModel("shinki", "reimu");
    model.step(
      input({
        bombPressed: true,
        aimX: model.target.x,
        aimY: model.target.y,
      }),
    );

    expect(model.projectiles).toHaveLength(11);
    expect(
      model.projectiles.filter(
        (projectile) => projectile.textureKey === BOMB_FAST_TEXTURE,
      ),
    ).toHaveLength(10);
    expect(
      model.projectiles.filter(
        (projectile) => projectile.textureKey === BOMB_HOMING_TEXTURE,
      ),
    ).toHaveLength(1);

    const spawnedByBomb = new Map(
      model.projectiles
        .filter(isShinkiBombProjectile)
        .map((projectile) => [projectile.id, { ...projectile }]),
    );
    for (let frame = 1; frame <= 272; frame += 1) {
      model.step(input());
      for (const projectile of model.projectiles.filter(isShinkiBombProjectile)) {
        if (!spawnedByBomb.has(projectile.id)) {
          spawnedByBomb.set(projectile.id, { ...projectile });
        }
      }
    }

    const spawnedProjectiles = Array.from(spawnedByBomb.values());
    const fast = spawnedProjectiles.filter(
      (projectile) => projectile.textureKey === BOMB_FAST_TEXTURE,
    );
    const homing = spawnedProjectiles.filter(
      (projectile) => projectile.textureKey === BOMB_HOMING_TEXTURE,
    );
    expect(fast).toHaveLength(240);
    expect(homing).toHaveLength(8);
    expect(new Set(fast.map((projectile) => projectile.damage))).toEqual(
      new Set([10]),
    );
    expect(new Set(homing.map((projectile) => projectile.damage))).toEqual(
      new Set([40]),
    );
    expect(roundedAngles(fast)).toEqual([
      -85, -75, -65, -55, -45, 45, 55, 65, 75, 85,
    ]);
    expect(relativeSpawnFrames(fast)).toEqual(
      Array.from({ length: 12 }, (_, volley) => [volley * 24, volley * 24 + 8]).flat(),
    );
    expect(relativeSpawnFrames(homing)).toEqual(
      Array.from({ length: 8 }, (_, shot) => shot * 32),
    );
    expect(homing.every((projectile) => projectile.homingUntil > projectile.homingStartAt)).toBe(true);
  });
});

function isShinkiBombProjectile(projectile: { readonly textureKey?: string }) {
  return (
    projectile.textureKey === BOMB_FAST_TEXTURE ||
    projectile.textureKey === BOMB_HOMING_TEXTURE
  );
}

function damagingBeams(model: Awaited<ReturnType<typeof shootOnceAtPoint>>) {
  return model.projectiles.filter(
    (projectile) =>
      projectile.kind === "laser" &&
      projectile.damage > 0 &&
      !Number.isFinite(projectile.width),
  );
}

function relativeSpawnFrames(
  projectiles: readonly { readonly visibleFrom: number }[],
): number[] {
  const first = Math.min(...projectiles.map((projectile) => projectile.visibleFrom));
  return Array.from(new Set(projectiles.map((projectile) => projectile.visibleFrom - first))).sort(
    (left, right) => left - right,
  );
}

function relativeSideOffsets(
  model: Awaited<ReturnType<typeof shootOnceAtPoint>>,
  projectiles: readonly { readonly y: number }[],
): number[] {
  return Array.from(new Set(projectiles.map((projectile) => Math.round(projectile.y - model.player.previousY)))).sort(
    (left, right) => left - right,
  );
}

function roundedAngles(projectiles: readonly { readonly angle: number }[]): number[] {
  return Array.from(new Set(projectiles.map((projectile) => Math.round((projectile.angle * 180) / Math.PI)))).sort(
    (left, right) => left - right,
  );
}
