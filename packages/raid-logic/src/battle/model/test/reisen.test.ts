import { describe, expect, it } from "vitest";
import {
  bulletSpeedRankToPixelsPerTick,
  speedRankToPixelsPerTick,
} from "@repo/types";
import {
  REISEN_AMMO_CAPACITY,
  REISEN_BOMB_CLEAR_RING_MULTIPLIER,
  REISEN_BOMB_HIT_CIRCLE_MULTIPLIER,
  REISEN_BOMB_SHIELD_LAYERS,
  REISEN_COST,
  REISEN_NORMAL_BULLET_SIZE,
  REISEN_NORMAL_FORWARD_DAMAGE_BY_TIER,
  REISEN_NORMAL_REPEAT_DELAY_FRAMES,
  REISEN_NORMAL_SPLIT_DAMAGE,
  REISEN_NORMAL_SPLIT_DELAY_TICKS,
  REISEN_NORMAL_TIER_COUNTS,
  REISEN_RELOAD_TICKS_PER_AMMO,
  REISEN_SHIELD_FORWARD_SPEED,
  REISEN_SHIELD_INVULNERABLE_TICKS,
  REISEN_SHIELD_MOVE_SPEED,
  getCharacterDefinition,
  hitCircleUnits,
} from "@repo/content";
import {
  createBattleModel,
  input,
  shootOnceAtPoint,
  testProjectile,
} from "./helpers";

describe("BattleModel Reisen", () => {
  it("exposes Reisen's base character definition", () => {
    const definition = getCharacterDefinition("reisen")!;

    expect(definition.cost).toBe(REISEN_COST);
    expect(definition.roleClass).toBe("assault");
    expect(definition.ammoCapacity).toBe(REISEN_AMMO_CAPACITY);
    expect(definition.reloadTicksPerAmmo).toBe(REISEN_RELOAD_TICKS_PER_AMMO);
    expect(definition.reloadStartPolicy).toBe("reset_to_zero");
    expect(definition.reloadCommitPolicy).toBe("commit_on_finish");
  });

  it("resets Reisen ammo to zero and commits reload only on finish", async () => {
    const model = await createBattleModel("reisen", "reimu");
    model.step(input({ shootPressed: true }));

    expect(model.player.ammo).toBe(REISEN_AMMO_CAPACITY - 1);

    model.step(input({ reloadPressed: true }));

    expect(model.player.reloadStartedAmmo).toBe(0);
    expect(model.player.reloadTotal).toBe(
      REISEN_RELOAD_TICKS_PER_AMMO * REISEN_AMMO_CAPACITY,
    );
    expect(model.player.reloadRemaining).toBe(
      REISEN_RELOAD_TICKS_PER_AMMO * REISEN_AMMO_CAPACITY,
    );
    expect(model.player.ammo).toBe(0);

    while (model.player.reloadRemaining > 0) {
      model.step(input());
    }

    expect(model.player.ammo).toBe(REISEN_AMMO_CAPACITY);
  });

  it("spawns Reisen normal shots by point tier", async () => {
    const tier1 = await shootOnceAtPoint("reisen", 0);
    expect(tier1.projectiles).toHaveLength(REISEN_NORMAL_TIER_COUNTS[1]);
    expect(
      tier1.projectiles.every(
        (projectile) =>
          projectile.textureKey === "bullet_type_8_offset_0" &&
          projectile.width === REISEN_NORMAL_BULLET_SIZE &&
          projectile.height === REISEN_NORMAL_BULLET_SIZE &&
          projectile.damage === REISEN_NORMAL_FORWARD_DAMAGE_BY_TIER[1],
      ),
    ).toBe(true);

    const tier2 = await shootOnceAtPoint("reisen", 100);
    expect(tier2.projectiles).toHaveLength(REISEN_NORMAL_TIER_COUNTS[2]);
    expect(
      tier2.projectiles.filter(
        (projectile) => projectile.textureKey === "bullet_type_8_offset_3",
      ),
    ).toHaveLength(2);
    expect(
      tier2.projectiles.filter(
        (projectile) =>
          projectile.textureKey === "bullet_type_8_offset_1" &&
          projectile.visibleFrom ===
            tier2.frame + REISEN_NORMAL_SPLIT_DELAY_TICKS &&
          projectile.damage === REISEN_NORMAL_SPLIT_DAMAGE,
      ),
    ).toHaveLength(4);

    const tier3 = await shootOnceAtPoint("reisen", 200);
    expect(tier3.projectiles).toHaveLength(REISEN_NORMAL_TIER_COUNTS[3]);
    expect(
      tier3.projectiles.filter(
        (projectile) =>
          projectile.textureKey === "bullet_type_8_offset_0" &&
          projectile.visibleFrom ===
            tier3.frame + REISEN_NORMAL_REPEAT_DELAY_FRAMES,
      ),
    ).toHaveLength(2);

    const tier4 = await shootOnceAtPoint("reisen", 300);
    expect(tier4.projectiles).toHaveLength(REISEN_NORMAL_TIER_COUNTS[4]);
    expect(
      tier4.projectiles.filter(
        (projectile) =>
          projectile.textureKey === "bullet_type_8_offset_3" &&
          projectile.visibleFrom ===
            tier4.frame + REISEN_NORMAL_REPEAT_DELAY_FRAMES,
      ),
    ).toHaveLength(2);
    expect(
      tier4.projectiles.filter(
        (projectile) =>
          projectile.textureKey === "bullet_type_8_offset_1" &&
          projectile.visibleFrom ===
            tier4.frame +
              REISEN_NORMAL_REPEAT_DELAY_FRAMES +
              REISEN_NORMAL_SPLIT_DELAY_TICKS,
      ),
    ).toHaveLength(4);
  });

  it("creates Reisen shield, locks switching and repeat bomb, and absorbs two hits", async () => {
    const model = await createBattleModel("reisen", "reimu");
    model.projectiles.push(
      testProjectile({
        id: 100,
        owner: "Player2",
        x:
          model.player.x +
          hitCircleUnits(REISEN_BOMB_CLEAR_RING_MULTIPLIER) / 2,
        y: model.player.y,
      }),
    );

    model.step(input({ bombPressed: true }));

    expect(model.player.reisenShieldLayers).toBe(REISEN_BOMB_SHIELD_LAYERS);
    expect(model.player.hitCircleRadiusMultiplier).toBe(
      REISEN_BOMB_HIT_CIRCLE_MULTIPLIER,
    );
    expect(model.projectiles.some((projectile) => projectile.id === 100)).toBe(
      false,
    );

    model.step(input({ alternateHeld: true, bombPressed: true }));

    expect(model.player.activeCharacter.id).toBe("reisen");
    expect(model.player.bombUses).toBe(1);

    const lives = model.player.lives;
    const hitsTaken = model.player.hitsTaken;
    model.projectiles.push(
      testProjectile({
        id: 101,
        owner: "Player2",
        x: model.player.x,
        y: model.player.y,
        couldClear: false,
      }),
    );
    model.step(input());

    expect(model.player.lives).toBe(lives);
    expect(model.player.hitsTaken).toBe(hitsTaken);
    expect(model.player.reisenShieldLayers).toBe(REISEN_BOMB_SHIELD_LAYERS - 1);
    expect(model.player.invulnerableUntil).toBe(
      REISEN_SHIELD_INVULNERABLE_TICKS,
    );

    model.projectiles.push(
      testProjectile({
        id: 102,
        owner: "Player2",
        x: model.player.x,
        y: model.player.y,
        couldClear: false,
      }),
    );
    model.step(input());

    expect(model.player.lives).toBe(lives);
    expect(model.player.hitsTaken).toBe(hitsTaken);
    expect(model.player.reisenShieldLayers).toBe(REISEN_BOMB_SHIELD_LAYERS - 1);

    model.projectiles.length = 0;
    while (model.player.invulnerableUntil > 0) {
      model.step(input());
    }

    model.projectiles.push(
      testProjectile({
        id: 103,
        owner: "Player2",
        x: model.player.x,
        y: model.player.y,
        couldClear: false,
      }),
    );
    model.step(input());

    expect(model.player.reisenShieldLayers).toBe(0);
    expect(model.player.hitCircleRadiusMultiplier).toBe(1);

    model.step(input({ alternateHeld: true }));

    expect(model.player.activeCharacter.id).toBe("reimu");
  });

  it("slows Reisen movement and accelerates forward shots while shielded", async () => {
    const model = await createBattleModel("reisen", "reimu");

    model.step(input({ bombPressed: true }));

    const xBefore = model.player.x;
    model.step(
      input({
        moveX: 1,
        shootPressed: true,
        aimX:
          model.player.x + hitCircleUnits(REISEN_BOMB_CLEAR_RING_MULTIPLIER),
        aimY: model.player.y,
      }),
    );

    expect(model.player.x - xBefore).toBeCloseTo(
      speedRankToPixelsPerTick(REISEN_SHIELD_MOVE_SPEED),
    );

    const forwardShots = model.projectiles.filter(
      (projectile) => projectile.textureKey === "bullet_type_8_offset_0",
    );
    expect(forwardShots).toHaveLength(REISEN_NORMAL_TIER_COUNTS[1]);
    expect(
      forwardShots.every((projectile) =>
        closeTo(
          Math.hypot(projectile.vx, projectile.vy),
          bulletSpeedRankToPixelsPerTick(REISEN_SHIELD_FORWARD_SPEED),
        ),
      ),
    ).toBe(true);
  });
});

function closeTo(left: number, right: number): boolean {
  return Math.abs(left - right) < 0.0001;
}
