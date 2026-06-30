import { describe, expect, it } from "vitest";
import { bulletSpeedRankToPixelsPerTick } from "@repo/types";
import {
  KAGUYA_AMMO_CAPACITY,
  KAGUYA_BOMB_BULLET_SIZE,
  KAGUYA_BOMB_DAMAGE,
  KAGUYA_BOMB_EXTENSION_HIT_CIRCLE_MULTIPLIER,
  KAGUYA_BOMB_FAMILIAR_HEALTH,
  KAGUYA_BOMB_LOCK_TICKS,
  KAGUYA_BOMB_SHOT_INTERVAL_FRAMES,
  KAGUYA_BOMB_SHOTS_PER_POINT,
  KAGUYA_BOMB_SIDE_HIT_CIRCLE_MULTIPLIER,
  KAGUYA_BOMB_WARNING_TICKS,
  KAGUYA_COST,
  KAGUYA_NORMAL_BULLET_SIZE,
  KAGUYA_NORMAL_ORBIT_DELAY_TICKS,
  KAGUYA_NORMAL_ORBIT_RADIUS,
  KAGUYA_NORMAL_RETARGET_SPEED,
  KAGUYA_NORMAL_TIER_COUNTS,
  KAGUYA_RELOAD_TICKS_PER_AMMO,
  getCharacterDefinition,
  hitCircleUnits,
} from "@repo/content";
import { createBattleModel, input, shootOnceAtPoint } from "./helpers";

describe("BattleModel Kaguya", () => {
  it("exposes Kaguya's base character definition", () => {
    const definition = getCharacterDefinition("kaguya")!;

    expect(definition.cost).toBe(KAGUYA_COST);
    expect(definition.roleClass).toBe("scout");
    expect(definition.ammoCapacity).toBe(KAGUYA_AMMO_CAPACITY);
    expect(definition.reloadTicksPerAmmo).toBe(KAGUYA_RELOAD_TICKS_PER_AMMO);
  });

  it("spawns orbit bullets by point tier", async () => {
    const tier1 = await shootOnceAtPoint("kaguya", 0);
    expect(tier1.projectiles).toHaveLength(KAGUYA_NORMAL_TIER_COUNTS[1]);
    expect(
      tier1.projectiles.every(
        (projectile) =>
          projectile.width === KAGUYA_NORMAL_BULLET_SIZE &&
          projectile.height === KAGUYA_NORMAL_BULLET_SIZE &&
          projectile.polarRadius === KAGUYA_NORMAL_ORBIT_RADIUS &&
          projectile.polarRadialSpeed === 0 &&
          projectile.polarFollowOwner === "Player1" &&
          projectile.retargetSpeed === KAGUYA_NORMAL_RETARGET_SPEED,
      ),
    ).toBe(true);
    expect(tier1.projectiles[0]!.retargetAt).toBe(
      tier1.frame + KAGUYA_NORMAL_ORBIT_DELAY_TICKS,
    );
    expect(tier1.projectiles[0]!.retargetX).toBeDefined();
    expect(tier1.projectiles[0]!.retargetY).toBeDefined();
    expect(tier1.projectiles[0]!.retargetAimOwner).toBe("Player1");
    expect(tier1.projectiles[0]!.polarAngle).toBeCloseTo(
      tier1.player.facing - Math.PI / 2,
    );
    expect(tier1.projectiles[1]!.polarAngle).toBeCloseTo(
      tier1.player.facing + Math.PI / 2,
    );

    const tier2 = await shootOnceAtPoint("kaguya", 100);
    expect(tier2.projectiles).toHaveLength(KAGUYA_NORMAL_TIER_COUNTS[2]);
    expect(tier2.projectiles[0]!.polarAngle).toBeCloseTo(
      tier2.player.facing + Math.PI,
    );

    const tier3 = await shootOnceAtPoint("kaguya", 200);
    expect(tier3.projectiles).toHaveLength(KAGUYA_NORMAL_TIER_COUNTS[3]);

    const tier4 = await shootOnceAtPoint("kaguya", 300);
    expect(tier4.projectiles).toHaveLength(KAGUYA_NORMAL_TIER_COUNTS[4]);
  });

  it("keeps orbit bullets around the current owner position", async () => {
    const model = await createBattleModel("kaguya", "reimu");
    model.step(input({ shootPressed: true, aimX: model.target.x, aimY: model.target.y }));

    const projectile = model.projectiles[0]!;
    model.step(input({ moveX: 1, aimX: model.target.x, aimY: model.target.y }));

    expect(projectile.polarOriginX).toBe(model.player.x);
    expect(projectile.polarOriginY).toBe(model.player.y);
  });

  it("retargets orbit bullets to the current aim point after orbiting", async () => {
    const model = await createBattleModel("kaguya", "reimu");
    model.step(
      input({
        shootPressed: true,
        aimX: model.player.x + hitCircleUnits(20),
        aimY: model.player.y,
      }),
    );

    const projectile = model.projectiles[0]!;
    while (model.frame < projectile.retargetAt! - 1) {
      model.step(input({ aimX: model.player.x, aimY: model.player.y }));
    }
    const aimX = model.player.x;
    const aimY = model.player.y + hitCircleUnits(20);
    model.step(input({ aimX, aimY }));

    expect(projectile.retargetAt).toBeUndefined();
    expect(projectile.polarOriginX).toBeUndefined();
    expect(Math.hypot(projectile.vx, projectile.vy)).toBeCloseTo(
      bulletSpeedRankToPixelsPerTick("high"),
    );
    expect(projectile.vy).toBeGreaterThan(0);
  });

  it("spawns Kaguya bomb warning triangle and three firing familiars", async () => {
    const model = await createBattleModel("kaguya", "reimu");
    const aimX = model.player.x + hitCircleUnits(10);
    const aimY = model.player.y + hitCircleUnits(4);

    model.step(input({ bombPressed: true, aimX, aimY }));

    const warningSegments = model.projectiles.filter(
      (projectile) => projectile.kind === "laser" && projectile.damage === 0,
    );
    expect(warningSegments).toHaveLength(3);
    expect(
      warningSegments.every(
        (projectile) =>
          projectile.expireAt !== undefined &&
          projectile.expireAt - model.frame <= KAGUYA_BOMB_WARNING_TICKS,
      ),
    ).toBe(true);

    const familiars = model.neutralMobManager.mobs.filter(
      (mob) => mob.state.kind === "kaguya_bomb_familiar",
    );
    expect(familiars).toHaveLength(3);
    expect(
      familiars.every(
        (mob) =>
          mob.state.MaxHealth === KAGUYA_BOMB_FAMILIAR_HEALTH &&
          mob.state.CurrentHealth === KAGUYA_BOMB_FAMILIAR_HEALTH,
      ),
    ).toBe(true);

    const bombBulletIds = trackBombBulletIds(model);
    for (
      let tick = 0;
      tick <=
      KAGUYA_BOMB_WARNING_TICKS +
        KAGUYA_BOMB_SHOT_INTERVAL_FRAMES * (KAGUYA_BOMB_SHOTS_PER_POINT - 1);
      tick += 1
    ) {
      model.step(input({ aimX, aimY }));
      collectBombBulletIds(model, bombBulletIds);
    }

    const bombBullets = model.projectiles.filter(
      (projectile) =>
        projectile.kind === "orb" && projectile.damage === KAGUYA_BOMB_DAMAGE,
    );
    expect(bombBulletIds.size).toBe(3 * KAGUYA_BOMB_SHOTS_PER_POINT);
    expect(
      bombBullets.every(
        (projectile) =>
          projectile.width === KAGUYA_BOMB_BULLET_SIZE &&
          projectile.height === KAGUYA_BOMB_BULLET_SIZE,
      ),
    ).toBe(true);

    const sideLength = hitCircleUnits(KAGUYA_BOMB_SIDE_HIT_CIRCLE_MULTIPLIER);
    const extension = hitCircleUnits(KAGUYA_BOMB_EXTENSION_HIT_CIRCLE_MULTIPLIER);
    expect(sideLength).toBeGreaterThan(extension);
  });

  it("stops one triangle side after its familiar is destroyed", async () => {
    const model = await createBattleModel("kaguya", "reimu");
    const aimX = model.player.x + hitCircleUnits(10);
    const aimY = model.player.y + hitCircleUnits(4);

    model.step(
      input({
        bombPressed: true,
        aimX,
        aimY,
      }),
    );

    const familiar = model.neutralMobManager.mobs.find(
      (mob) => mob.state.kind === "kaguya_bomb_familiar",
    );
    expect(familiar?.onProjectileHit(KAGUYA_BOMB_FAMILIAR_HEALTH)).toBe(
      "accepted",
    );
    expect(familiar?.state.active).toBe(false);

    const bombBulletIds = trackBombBulletIds(model);
    for (
      let tick = 0;
      tick <=
      KAGUYA_BOMB_WARNING_TICKS +
        KAGUYA_BOMB_SHOT_INTERVAL_FRAMES * (KAGUYA_BOMB_SHOTS_PER_POINT - 1);
      tick += 1
    ) {
      model.step(input({ aimX, aimY }));
      collectBombBulletIds(model, bombBulletIds);
    }

    expect(bombBulletIds.size).toBe(2 * KAGUYA_BOMB_SHOTS_PER_POINT);
  });

  it("locks Kaguya switching and repeat bomb while bomb volleys continue but allows fire and reload", async () => {
    const model = await createBattleModel("kaguya", "reimu");

    model.step(input({ bombPressed: true }));

    expect(model.player.bombCooldownUntil).toBe(KAGUYA_BOMB_LOCK_TICKS);
    expect(model.player.switchLockedUntil).toBe(KAGUYA_BOMB_LOCK_TICKS);
    expect(model.player.bombUses).toBe(1);

    model.step(
      input({
        alternateHeld: true,
        bombPressed: true,
        shootPressed: true,
        aimX: model.target.x,
        aimY: model.target.y,
      }),
    );

    expect(model.player.activeCharacter.id).toBe("kaguya");
    expect(model.player.bombUses).toBe(1);
    expect(model.player.shotsFired).toBe(1);
    expect(model.player.ammo).toBe(0);

    model.step(input({ reloadPressed: true }));

    expect(model.player.reloadRemaining).toBeGreaterThan(0);

    for (let tick = 0; tick < KAGUYA_BOMB_LOCK_TICKS; tick += 1) {
      model.step(input());
    }
    model.step(input({ alternateHeld: true }));

    expect(model.player.activeCharacter.id).toBe("reimu");
  });
});

function trackBombBulletIds(model: Awaited<ReturnType<typeof createBattleModel>>): Set<number> {
  const ids = new Set<number>();
  collectBombBulletIds(model, ids);
  return ids;
}

function collectBombBulletIds(
  model: Awaited<ReturnType<typeof createBattleModel>>,
  ids: Set<number>,
): void {
  for (const projectile of model.projectiles) {
    if (projectile.kind === "orb" && projectile.damage === KAGUYA_BOMB_DAMAGE) {
      ids.add(projectile.id);
    }
  }
}
