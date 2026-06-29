import { describe, expect, it } from "vitest";
import {
  FLANDRE_NORMAL_DAMAGE_BY_TIER,
  FLANDRE_NORMAL_DURATION_TICKS,
  FLANDRE_NORMAL_LENGTH_BY_TIER,
  FLANDRE_NORMAL_TEXTURE_KEY,
  FLANDRE_NORMAL_THICKNESS,
  getCharacterDefinition,
} from "@repo/content";
import { createBattleModel, input, shootOnceAtPoint } from "./helpers";

describe("BattleModel Flandre", () => {
  it("spawns a fixed owner-following melee blade by point tier", async () => {
    const tier1 = await shootOnceAtPoint("flandre", 0);
    expect(tier1.projectiles).toHaveLength(1);
    expect(tier1.projectiles[0]).toMatchObject({
      kind: "laser",
      sourceCharacterId: "flandre",
      textureKey: FLANDRE_NORMAL_TEXTURE_KEY,
      width: FLANDRE_NORMAL_LENGTH_BY_TIER[1],
      height: FLANDRE_NORMAL_THICKNESS,
      renderHeight: FLANDRE_NORMAL_THICKNESS,
      damage: FLANDRE_NORMAL_DAMAGE_BY_TIER[1],
      followOwner: "Player1",
      followOwnerDistance: FLANDRE_NORMAL_LENGTH_BY_TIER[1] / 2,
      piercesTargets: true,
      couldClear: false,
    });

    const tier2 = await shootOnceAtPoint("flandre", 100);
    expect(tier2.projectiles[0]!.width).toBe(FLANDRE_NORMAL_LENGTH_BY_TIER[2]);
    expect(tier2.projectiles[0]!.damage).toBe(
      FLANDRE_NORMAL_DAMAGE_BY_TIER[2],
    );

    const tier3 = await shootOnceAtPoint("flandre", 200);
    expect(tier3.projectiles[0]!.width).toBe(FLANDRE_NORMAL_LENGTH_BY_TIER[3]);
    expect(tier3.projectiles[0]!.damage).toBe(
      FLANDRE_NORMAL_DAMAGE_BY_TIER[3],
    );

    const tier4 = await shootOnceAtPoint("flandre", 300);
    expect(tier4.projectiles[0]!.width).toBe(FLANDRE_NORMAL_LENGTH_BY_TIER[4]);
    expect(tier4.projectiles[0]!.damage).toBe(
      FLANDRE_NORMAL_DAMAGE_BY_TIER[4],
    );
  });

  it("locks switching, raises move speed, and still allows bomb during the normal attack", async () => {
    const model = await createBattleModel("flandre", "reimu");
    const baseDefinition = getCharacterDefinition("flandre")!;

    model.step(
      input({
        shootPressed: true,
        aimX: model.target.x,
        aimY: model.target.y,
      }),
    );

    expect(model.player.switchLockedUntil).toBe(FLANDRE_NORMAL_DURATION_TICKS);
    expect(model.player.moveSpeedOverride).toBe("high");
    expect(model.player.moveSpeedOverrideUntil).toBe(
      FLANDRE_NORMAL_DURATION_TICKS,
    );

    model.step(
      input({
        alternateHeld: true,
        bombPressed: true,
        aimX: model.target.x,
        aimY: model.target.y,
      }),
    );

    expect(model.player.activeCharacter.id).toBe("flandre");
    expect(model.player.bombUses).toBe(1);

    for (let tick = 0; tick < FLANDRE_NORMAL_DURATION_TICKS; tick += 1) {
      model.step(input());
    }

    expect(model.player.moveSpeedOverride).toBeUndefined();
    expect(model.player.activeCharacter.moveSpeed).toBe(baseDefinition.moveSpeed);

    model.step(input({ alternateHeld: true }));
    expect(model.player.activeCharacter.id).toBe("reimu");
  });

  it("keeps the melee blade centered ahead of Flandre while she moves", async () => {
    const model = await createBattleModel("flandre", "reimu");
    model.step(
      input({
        shootPressed: true,
        aimX: model.target.x,
        aimY: model.target.y,
      }),
    );

    const projectile = model.projectiles[0]!;
    const offsetX = projectile.x - model.player.x;
    const offsetY = projectile.y - model.player.y;

    model.step(
      input({
        moveX: 1,
        aimX: model.target.x,
        aimY: model.target.y,
      }),
    );

    expect(projectile.x - model.player.x).toBeCloseTo(offsetX);
    expect(projectile.y - model.player.y).toBeCloseTo(offsetY);
    expect(projectile.angle).toBeCloseTo(projectile.followOwnerAngle!);
  });

  it("spawns familiars with 30 health instead of infinite health", async () => {
    const model = await createBattleModel("flandre", "reimu");

    model.step(
      input({
        bombPressed: true,
        aimX: model.target.x,
        aimY: model.target.y,
      }),
    );

    const familiar = model.neutralMobManager.mobs.find(
      (mob) => mob.state.kind === "flandre_familiar",
    );

    expect(familiar?.state.MaxHealth).toBe(30);
    expect(familiar?.state.CurrentHealth).toBe(30);
  });
});
