import { describe, expect, it } from "vitest";
import { HIT_CIRCLE_DIAMETER } from "@repo/constants";
import { bulletSpeedRankToPixelsPerTick } from "@repo/types";
import {
  StaticRectNeutralMob,
  createBattleModel,
  initializeBattleModel,
  input,
  shootOnceAtPoint,
  testProjectile,
} from "./helpers";
import { BattleModel } from "..";

describe("BattleModel Sakuya", () => {
  it("sakuya keeps current ammo and only restores at the end", async () => {
    const model = await createBattleModel("sakuya", "reimu");
    model.step(input({ shootPressed: true }));
    expect(model.player.ammo).toBe(2);

    model.step(input({ reloadPressed: true }));

    expect(model.player.reloadStartedAmmo).toBe(2);
    expect(model.player.reloadTotal).toBe(54);
    expect(model.player.reloadRemaining).toBe(54);
    expect(model.player.ammo).toBe(2);

    for (
      let index = 0;
      index < 500 && model.player.reloadRemaining > 0;
      index += 1
    ) {
      model.step(input());
    }

    expect(model.player.ammo).toBe(3);
  });

  it("sakuya starts reload from 1/3 without consuming an immediate tick", async () => {
    const model = await createBattleModel("sakuya", "reimu");
    model.step(input({ shootPressed: true }));
    for (let index = 0; index < 20; index += 1) {
      model.step(input());
    }
    model.step(input({ shootPressed: true }));

    expect(model.player.ammo).toBe(1);

    model.step(input({ reloadPressed: true }));

    expect(model.player.reloadStartedAmmo).toBe(1);
    expect(model.player.reloadTotal).toBe(108);
    expect(model.player.reloadRemaining).toBe(108);
    expect(model.player.ammo).toBe(1);
  });

  it("sakuya starts reload from 0/3 without consuming an immediate tick", async () => {
    const model = await createBattleModel("sakuya", "reimu");
    model.step(input({ shootPressed: true }));
    for (let index = 0; index < 20; index += 1) {
      model.step(input());
    }
    model.step(input({ shootPressed: true }));
    for (let index = 0; index < 20; index += 1) {
      model.step(input());
    }
    model.step(input({ shootPressed: true }));

    expect(model.player.ammo).toBe(0);

    model.step(input({ reloadPressed: true }));

    expect(model.player.reloadStartedAmmo).toBe(0);
    expect(model.player.reloadTotal).toBe(162);
    expect(model.player.reloadRemaining).toBe(162);
    expect(model.player.ammo).toBe(0);
  });

  it("sakuya bomb clears nearby projectiles and pauses remaining projectiles deterministically", async () => {
    const model = await createBattleModel("sakuya", "reimu");
    model.projectiles.push(
      testProjectile({
        id: 100,
        owner: "Player2",
        x: model.player.x + 8,
        y: model.player.y,
      }),
      testProjectile({
        id: 101,
        owner: "Player2",
        x: model.player.x + 200,
        y: model.player.y,
        vx: 1,
      }),
    );

    model.step(input({ bombPressed: true }));

    const distant = model.projectiles.find(
      (projectile) => projectile.id === 101,
    );
    expect(model.projectiles.some((projectile) => projectile.id === 100)).toBe(
      false,
    );
    expect(distant?.x).toBe(model.player.x + 200);
    expect(distant?.pausedUntil).toBe(model.frame + 60);
    expect(model.effects.some((effect) => effect.kind === "ring")).toBe(true);
  });

  it("sakuya bomb pauses same-frame multi-shot projectiles through the shared spawn interface", async () => {
    const model = await createBattleModel("sakuya", "reimu", ["multi_shot"]);
    const action = input({ bombPressed: true, shootPressed: true });

    model.step(action);

    const extraShot = model.projectiles.find(
      (projectile) =>
        projectile.textureKey === "bullet_type_7_offset_0" &&
        projectile.owner === "Player1",
    );
    expect(extraShot?.pausedUntil).toBe(model.frame + 60);
    expect(
      model.projectiles.filter((projectile) => projectile.owner === "Player1"),
    ).toHaveLength(8);

    const snapshot = model.serialize();
    const originalHash = model.hashHex();

    model.deserialize(snapshot);

    expect(model.hashHex()).toBe(originalHash);
  });

  it("sakuya time stop pauses reload progress and resumes it after the effect ends", async () => {
    const model = await createBattleModel("sakuya", "reimu");
    model.step(input({ shootPressed: true }));
    model.step(input({ reloadPressed: true }));

    expect(model.player.reloadRemaining).toBe(54);

    model.step(input({ bombPressed: true }));
    const frozenReloadRemaining = model.player.reloadRemaining;

    for (let index = 0; index < 30; index += 1) {
      model.step(input());
    }

    expect(model.player.reloadRemaining).toBe(frozenReloadRemaining);

    while (model.player.timeStopUntil > 0) {
      model.step(input());
    }

    expect(model.player.reloadRemaining).toBeLessThan(frozenReloadRemaining);
  });

  it("sakuya time stop pauses active card cooldown progress", async () => {
    const model = await createBattleModel(
      "sakuya",
      "reimu",
      ["spirit_strike_card"],
      "spirit_strike_card",
    );
    model.step(input({ activeCardPressed: true }));
    const initialCooldown = model.player.activeCardCooldownUntil;

    model.step(input({ bombPressed: true }));
    const frozenCooldown = model.player.activeCardCooldownUntil;

    for (let index = 0; index < 30; index += 1) {
      model.step(input());
    }

    expect(model.player.activeCardCooldownUntil).toBe(frozenCooldown);

    while (model.player.timeStopUntil > 0) {
      model.step(input());
    }

    expect(model.player.activeCardCooldownUntil).toBe(initialCooldown - 1);
    model.step(input());
    expect(model.player.activeCardCooldownUntil).toBe(initialCooldown - 2);
  });

  it("sakuya time stop pauses same-frame snipe knife until time resumes", async () => {
    const model = await createBattleModel("sakuya", "reimu");
    model.pointManager.setPointCount(model.player, 300);

    model.step(input({ bombPressed: true, shootPressed: true }));

    const snipeKnife = model.projectiles.find(
      (projectile) =>
        projectile.owner === "Player1" &&
        projectile.kind === "knife" &&
        projectile.textureKey === "bullet_type_20_offset_2",
    );
    expect(snipeKnife).toBeDefined();
    expect(snipeKnife?.pausedUntil).toBeGreaterThan(model.frame);

    const startX = snipeKnife!.x;
    const startY = snipeKnife!.y;

    model.step(input());

    expect(snipeKnife!.x).toBeCloseTo(startX);
    expect(snipeKnife!.y).toBeCloseTo(startY);

    while (model.player.timeStopUntil > 0) {
      model.step(input());
    }

    model.step(input());

    expect(snipeKnife!.x).not.toBeCloseTo(startX);
  });

  it("sakuya time stop restores projectile timelines when cancelled by a hit", async () => {
    const model = await createBattleModel("sakuya", "reimu");
    const delayedVisibleFrom = model.frame + 31;
    model.projectiles.push(
      testProjectile({
        id: 200,
        owner: "Player2",
        x: model.player.x + HIT_CIRCLE_DIAMETER * 40,
        y: model.player.y,
        vx: 1,
        visibleFrom: delayedVisibleFrom,
      }),
      testProjectile({
        id: 201,
        owner: "Player2",
        x: model.player.x,
        y: model.player.y,
        couldClear: false,
      }),
    );

    model.step(input({ bombPressed: true }));

    const delayed = model.projectiles.find(
      (projectile) => projectile.id === 200,
    );
    expect(model.player.timeStopUntil).toBe(0);
    expect(delayed?.pausedUntil).toBe(model.frame);
    expect(delayed?.visibleFrom).toBe(delayedVisibleFrom);
  });

  it("keeps polar bullets paused during Sakuya time stop", async () => {
    const model = await createBattleModel("sakuya", "reimu");
    const projectile = testProjectile({
      id: 100,
      owner: "Player2",
      x: model.player.x + HIT_CIRCLE_DIAMETER * 80,
      y: model.player.y,
      polarOriginX: model.player.x,
      polarOriginY: model.player.y,
      polarRadius: HIT_CIRCLE_DIAMETER * 80,
      polarAngle: 0,
      polarRadialSpeed: 1,
      polarAngularSpeed: Math.PI / 60,
    });
    model.projectiles.push(projectile);

    model.step(input({ bombPressed: true }));

    expect(projectile.pausedUntil).toBe(model.frame + 60);
    expect(projectile.x).toBe(model.player.x + HIT_CIRCLE_DIAMETER * 80);
    expect(projectile.polarRadius).toBe(HIT_CIRCLE_DIAMETER * 80);

    model.step(input());

    expect(projectile.x).toBe(model.player.x + HIT_CIRCLE_DIAMETER * 80);
    expect(projectile.polarRadius).toBe(HIT_CIRCLE_DIAMETER * 80);
  });

  it("adds Sakuya snipe and side volleys by point tier", async () => {
    const tier1 = await shootOnceAtPoint("sakuya", 0);
    expect(tier1.projectiles).toHaveLength(3);
    expect(
      tier1.projectiles.filter(
        (projectile) => projectile.textureKey === "bullet_type_20_offset_2",
      ),
    ).toHaveLength(1);

    const tier2 = await shootOnceAtPoint("sakuya", 100);
    // 2 base + 2 snipes (frame 0, frame 8) + 4 side (2 per side)
    expect(tier2.projectiles).toHaveLength(8);
    const tier2SideKnives = tier2.projectiles.filter(
      (projectile) => projectile.textureKey === "bullet_type_20_offset_3",
    );
    expect(tier2SideKnives).toHaveLength(4);
    for (const projectile of tier2SideKnives) {
      expect(Math.hypot(projectile.vx, projectile.vy)).toBeCloseTo(
        bulletSpeedRankToPixelsPerTick("high"),
      );
    }
    // 2 knives per side → 2 at facing - PI/6, 2 at facing + PI/6
    expect(tier2SideKnives.map((projectile) => projectile.angle).sort()).toEqual(
      [
        tier2.player.facing - Math.PI / 6,
        tier2.player.facing - Math.PI / 6,
        tier2.player.facing + Math.PI / 6,
        tier2.player.facing + Math.PI / 6,
      ].sort(),
    );
    expect(
      tier2.projectiles.filter(
        (projectile) =>
          projectile.textureKey === "bullet_type_20_offset_2" &&
          projectile.visibleFrom === tier2.frame + 8,
      ),
    ).toHaveLength(1);

    const tier3 = await shootOnceAtPoint("sakuya", 200);
    // 2 base + 3 snipes (frame 0, 8, 16) + 4 side
    expect(tier3.projectiles).toHaveLength(9);
    expect(
      tier3.projectiles.filter(
        (projectile) =>
          projectile.textureKey === "bullet_type_20_offset_2" &&
          projectile.visibleFrom === tier3.frame + 16,
      ),
    ).toHaveLength(1);
    expect(
      tier3.projectiles.filter(
        (projectile) =>
          projectile.textureKey === "bullet_type_20_offset_0" &&
          projectile.visibleFrom === tier3.frame,
      ),
    ).toHaveLength(2);

    const tier4 = await shootOnceAtPoint("sakuya", 300);
    // 2 base + 4 snipes (frame 0, 8, 16, 24) + 8 side (2 rounds × 2 per side)
    expect(tier4.projectiles).toHaveLength(14);
    expect(
      tier4.projectiles.filter(
        (projectile) =>
          projectile.textureKey === "bullet_type_20_offset_3" &&
          projectile.visibleFrom === tier4.frame + 8,
      ),
    ).toHaveLength(4);
    expect(
      tier4.projectiles.filter(
        (projectile) =>
          projectile.textureKey === "bullet_type_20_offset_2" &&
          projectile.visibleFrom === tier4.frame + 24,
      ),
    ).toHaveLength(1);
  });

  it("targets the neutral enemy nearest the crosshair with snipe knives in collaborate mode", async () => {
    const model = await initializeBattleModel(
      new BattleModel(
        {
          player: {
            primaryCharacterId: "sakuya",
            alternateCharacterId: "reimu",
          },
          target: {
            primaryCharacterId: "reimu",
            alternateCharacterId: "marisa",
          },
        },
        { battleMode: "collaborate" },
      ),
    );
    model.pointManager.setPointCount(model.player, 300);
    model.neutralMobManager.addNeutralMob(
      new StaticRectNeutralMob(model.neutralMobManager.allocateNeutralMobId(), 520, 180),
    );
    model.neutralMobManager.addNeutralMob(
      new StaticRectNeutralMob(model.neutralMobManager.allocateNeutralMobId(), 920, 460),
    );

    model.stepVersus(
      input({
        shootPressed: true,
        aimX: 930,
        aimY: 470,
      }),
      input(),
    );

    const snipeKnife = model.projectiles.find(
      (projectile) =>
        projectile.owner === "Player1" &&
        projectile.textureKey === "bullet_type_20_offset_2",
    );
    expect(snipeKnife).toBeDefined();
    expect(snipeKnife?.angle).toBeCloseTo(
      Math.atan2(460 - model.player.y, 920 - model.player.x),
    );
    expect(snipeKnife?.angle).not.toBeCloseTo(
      Math.atan2(model.target.y - model.player.y, model.target.x - model.player.x),
    );
  });
});
