import { describe, expect, it } from "vitest";
import { HIT_CIRCLE_DIAMETER } from "@repo/constants";
import {
  createBattleModel,
  input,
  shootOnceAtPoint,
  testProjectile,
} from "./helpers";

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
        projectile.textureKey === "bullet_type_8_offset_0" &&
        projectile.owner === "Player1",
    );
    expect(extraShot?.pausedUntil).toBe(model.frame + 60);
    expect(
      model.projectiles.filter((projectile) => projectile.owner === "Player1"),
    ).toHaveLength(7);

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

  it("sakuya time stop preserves delayed volley intervals until time resumes", async () => {
    const model = await createBattleModel("sakuya", "reimu");
    model.setPlayerPointCount(300);

    model.step(input({ bombPressed: true, shootPressed: true }));

    const delayedVolley = model.projectiles.find(
      (projectile) =>
        projectile.owner === "Player1" &&
        projectile.kind === "knife" &&
        projectile.visibleFrom === model.frame + 66,
    );
    expect(delayedVolley).toBeDefined();
    expect(delayedVolley?.pausedUntil).toBe(model.frame + 66);

    const startX = delayedVolley!.x;
    const startY = delayedVolley!.y;

    while (model.player.timeStopUntil > 0) {
      model.step(input());
    }

    expect(delayedVolley!.visibleFrom - model.frame).toBe(6);
    expect(delayedVolley!.x).toBeCloseTo(startX);
    expect(delayedVolley!.y).toBeCloseTo(startY);

    while (model.frame < delayedVolley!.visibleFrom) {
      model.step(input());
    }

    expect(delayedVolley!.x).not.toBeCloseTo(startX);
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

  it("adds Sakuya side volleys and delayed center volley by point tier", async () => {
    const tier1 = await shootOnceAtPoint("sakuya", 0);
    expect(tier1.projectiles).toHaveLength(2);

    const tier2 = await shootOnceAtPoint("sakuya", 100);
    expect(tier2.projectiles).toHaveLength(6);
    expect(
      tier2.projectiles.filter(
        (projectile) => projectile.visibleFrom === tier2.frame + 6,
      ),
    ).toHaveLength(2);

    const tier3 = await shootOnceAtPoint("sakuya", 200);
    expect(tier3.projectiles).toHaveLength(10);
    expect(
      tier3.projectiles.filter(
        (projectile) => projectile.visibleFrom === tier3.frame + 18,
      ),
    ).toHaveLength(2);

    const tier4 = await shootOnceAtPoint("sakuya", 300);
    expect(tier4.projectiles).toHaveLength(12);
    expect(
      tier4.projectiles.filter(
        (projectile) => projectile.visibleFrom === tier4.frame + 6,
      ),
    ).toHaveLength(4);
  });
});
