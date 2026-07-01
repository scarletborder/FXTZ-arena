import { describe, expect, it } from "vitest";
import {
  getCharacterDefinition,
  IKU_AMMO_CAPACITY,
  IKU_BOMB_DAMAGE,
  IKU_BOMB_FAMILIAR_COUNT,
  IKU_BOMB_FAMILIAR_HEALTH,
  IKU_BOMB_FAMILIAR_LIFETIME_TICKS,
  IKU_BOMB_TURN_INTERVAL_TICKS,
  IKU_COST,
  IKU_LIGHTNING_SIZE,
  IKU_LIGHTNING_TEXTURE,
  IKU_NORMAL_DEATH_DAMAGE_BY_TIER,
  IKU_NORMAL_FAMILIAR_HEALTH,
  IKU_NORMAL_FAMILIAR_LIFETIME_TICKS,
  IKU_NORMAL_FAMILIAR_PHYSICAL_DAMAGE,
  IKU_RELOAD_TICKS_PER_AMMO,
  IKU_WINGMAN_DAMAGE_BY_TIER,
} from "@repo/content";
import { createBattleModel, input, shootOnceAtPoint } from "./helpers";

describe("BattleModel Iku", () => {
  it("exposes Iku's base character definition", () => {
    const definition = getCharacterDefinition("iku")!;

    expect(definition.cost).toBe(IKU_COST);
    expect(definition.roleClass).toBe("assault");
    expect(definition.ammoCapacity).toBe(IKU_AMMO_CAPACITY);
    expect(definition.reloadTicksPerAmmo).toBe(IKU_RELOAD_TICKS_PER_AMMO);
    expect(definition.reloadStartPolicy).toBe("reset_to_zero");
    expect(definition.reloadCommitPolicy).toBe("commit_on_finish");
  });

  it("spawns normal familiars and wingman lightning by point tier", async () => {
    const tier1 = await shootOnceAtPoint("iku", 0);
    expect(ikuNormalFamiliars(tier1)).toHaveLength(1);
    expect(ikuLightning(tier1)).toHaveLength(0);
    expect(ikuNormalFamiliars(tier1)[0]?.state.CurrentHealth).toBe(
      IKU_NORMAL_FAMILIAR_HEALTH,
    );
    expect(ikuNormalFamiliars(tier1)[0]?.state.physicalAttackDamage).toBe(
      IKU_NORMAL_FAMILIAR_PHYSICAL_DAMAGE,
    );

    const tier2 = await shootOnceAtPoint("iku", 100);
    expect(ikuNormalFamiliars(tier2)).toHaveLength(1);
    expect(ikuLightning(tier2)).toHaveLength(2);
    expect(
      ikuLightning(tier2).every(
        (projectile) =>
          projectile.damage === IKU_WINGMAN_DAMAGE_BY_TIER[2] &&
          projectile.width === IKU_LIGHTNING_SIZE &&
          projectile.height === IKU_LIGHTNING_SIZE,
      ),
    ).toBe(true);

    const tier4 = await shootOnceAtPoint("iku", 300);
    expect(ikuNormalFamiliars(tier4)).toHaveLength(1);
    expect(ikuLightning(tier4)).toHaveLength(4);
    expect(
      ikuLightning(tier4).every(
        (projectile) => projectile.damage === IKU_WINGMAN_DAMAGE_BY_TIER[4],
      ),
    ).toBe(true);
  });

  it("splits normal familiars into tiered lightning on natural death", async () => {
    const model = await shootOnceAtPoint("iku", 200);

    for (let tick = 0; tick < IKU_NORMAL_FAMILIAR_LIFETIME_TICKS; tick += 1) {
      model.step(input({ aimX: model.target.x, aimY: model.target.y }));
    }

    const splitLightning = ikuLightning(model).filter(
      (projectile) => projectile.damage === IKU_NORMAL_DEATH_DAMAGE_BY_TIER[3],
    );
    expect(ikuNormalFamiliars(model)).toHaveLength(0);
    expect(splitLightning).toHaveLength(4);
    expect(
      splitLightning.every(
        (projectile) => projectile.textureKey === IKU_LIGHTNING_TEXTURE,
      ),
    ).toBe(true);
  });

  it("splits normal familiars after being destroyed by damage", async () => {
    const model = await shootOnceAtPoint("iku", 0);
    const familiar = ikuNormalFamiliars(model)[0]!;

    expect(familiar.onProjectileHit(IKU_NORMAL_FAMILIAR_HEALTH)).toBe(
      "accepted",
    );
    model.step(input({ aimX: model.target.x, aimY: model.target.y }));

    expect(ikuNormalFamiliars(model)).toHaveLength(0);
    expect(ikuLightning(model)).toHaveLength(2);
    expect(
      ikuLightning(model).every(
        (projectile) =>
          projectile.damage === IKU_NORMAL_DEATH_DAMAGE_BY_TIER[1],
      ),
    ).toBe(true);
  });

  it("spawns nine bomb familiars that turn every 1.5s and expire after 6.5s", async () => {
    const model = await createBattleModel("iku", "reimu");
    const control = await createBattleModel("iku", "reimu");

    model.step(input({ bombPressed: true }));
    control.step(input());
    const familiars = ikuBombFamiliars(model);
    expect(familiars).toHaveLength(IKU_BOMB_FAMILIAR_COUNT);
    expect(
      familiars.every(
        (mob) =>
          mob.state.CurrentHealth === IKU_BOMB_FAMILIAR_HEALTH &&
          mob.state.MaxHealth === IKU_BOMB_FAMILIAR_HEALTH,
      ),
    ).toBe(true);

    let previousBombProjectileId = model.serialize().nextProjectileId;
    let previousControlProjectileId = control.serialize().nextProjectileId;
    const expectedVolleyCount = Math.floor(
      IKU_BOMB_FAMILIAR_LIFETIME_TICKS / IKU_BOMB_TURN_INTERVAL_TICKS,
    );
    let bombProjectilesSpawned = 0;

    for (let volley = 0; volley < expectedVolleyCount; volley += 1) {
      for (let tick = 0; tick < IKU_BOMB_TURN_INTERVAL_TICKS; tick += 1) {
        model.step(input());
        control.step(input());
      }

      const bombLightning = ikuLightning(model).filter(
        (projectile) => projectile.damage === IKU_BOMB_DAMAGE,
      );
      expect(
        bombLightning.every(
          (projectile) => projectile.textureKey === IKU_LIGHTNING_TEXTURE,
        ),
      ).toBe(true);
      const bombProjectileDelta =
        model.serialize().nextProjectileId - previousBombProjectileId;
      const controlProjectileDelta =
        control.serialize().nextProjectileId - previousControlProjectileId;
      const volleyProjectileCount =
        bombProjectileDelta - controlProjectileDelta;
      expect(volleyProjectileCount).toBe(
        IKU_BOMB_FAMILIAR_COUNT * 6,
      );
      bombProjectilesSpawned += volleyProjectileCount;
      previousBombProjectileId = model.serialize().nextProjectileId;
      previousControlProjectileId = control.serialize().nextProjectileId;
    }

    for (
      let tick = expectedVolleyCount * IKU_BOMB_TURN_INTERVAL_TICKS;
      tick < IKU_BOMB_FAMILIAR_LIFETIME_TICKS;
      tick += 1
    ) {
      model.step(input());
      control.step(input());
    }

    expect(ikuBombFamiliars(model)).toHaveLength(0);
    expect(bombProjectilesSpawned).toBe(
      IKU_BOMB_FAMILIAR_COUNT * 6 * expectedVolleyCount,
    );
  });

  it("recreates Iku familiars from rollback snapshots after they disappeared", async () => {
    const model = await shootOnceAtPoint("iku", 0);
    const snapshot = model.serialize();
    const snapshotHash = model.hashHex();

    for (let tick = 0; tick <= IKU_NORMAL_FAMILIAR_LIFETIME_TICKS; tick += 1) {
      model.step(input({ aimX: model.target.x, aimY: model.target.y }));
    }
    expect(ikuNormalFamiliars(model)).toHaveLength(0);

    model.deserialize(snapshot);
    expect(model.hashHex()).toBe(snapshotHash);
    expect(ikuNormalFamiliars(model)).toHaveLength(1);
  });
});

type IkuTestModel = Awaited<ReturnType<typeof createBattleModel>>;

function ikuNormalFamiliars(model: IkuTestModel) {
  return model.neutralMobManager.mobs.filter(
    (mob) => mob.state.kind === "iku_normal_familiar",
  );
}

function ikuBombFamiliars(model: IkuTestModel) {
  return model.neutralMobManager.mobs.filter(
    (mob) => mob.state.kind === "iku_bomb_familiar",
  );
}

function ikuLightning(model: IkuTestModel) {
  return model.projectiles.filter(
    (projectile) =>
      projectile.sourceCharacterId === "iku" &&
      projectile.textureKey === IKU_LIGHTNING_TEXTURE,
  );
}
