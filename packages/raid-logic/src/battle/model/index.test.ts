import { describe, expect, it, vi } from "vitest";

import {
  NeutralMob,
  type BattleInputState,
  type NeutralMobState,
} from "@repo/types";
import { HIT_CIRCLE_DIAMETER } from "@repo/constants";
import type { BattleLoadouts } from "../loadout";
import { POINT_COUNT_MAX } from "../constants";
import { BattleModel } from ".";
import { BattlePhysics } from "./physics-adapter";
import { createPointState } from "./points";
import { stepBulletProjectile } from "./projectile/bullet";
import {
  clearProjectilesAround,
  type BulletProjectileParams,
  type LaserProjectileParams,
} from "./projectile";

describe("BattleModel rollback snapshots", () => {
  it("restores frame-relative timers without changing replay results", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const model = await createBattleModel();
    const inputs = createInputs(100);

    for (let index = 0; index < 12; index += 1) {
      model.step(inputs[index]!);
    }

    const snapshot = model.serialize();
    const snapshotHash = model.hash();

    for (let index = 12; index < inputs.length; index += 1) {
      model.step(inputs[index]!);
    }
    const originalHash = model.hash();

    model.deserialize(snapshot);
    expect(model.frame).toBe(snapshot.frame);
    expect(model.hash()).toBe(snapshotHash);

    for (let index = 12; index < inputs.length; index += 1) {
      model.step(inputs[index]!);
    }

    expect(model.hash()).toBe(originalHash);
    logSpy.mockRestore();
  });

  it("restores the projectile id allocator after generated projectiles were removed", async () => {
    const model = await createBattleModel("sakuya", "reimu");
    model.step(
      input({
        shootPressed: true,
        aimX: model.player.x - 100,
        aimY: model.player.y,
      }),
    );
    expect(model.projectiles.map((projectile) => projectile.id)).toEqual([
      1, 2,
    ]);
    model.projectiles.length = 0;
    model.player.fireCooldownUntil = 0;
    const snapshot = model.serialize();
    const action = input({
      shootPressed: true,
      aimX: model.player.x - 100,
      aimY: model.player.y,
    });

    model.step(action);
    const originalIds = model.projectiles.map((projectile) => projectile.id);
    const originalHash = model.hashHex();

    model.deserialize(snapshot);
    model.step(action);

    expect(model.projectiles.map((projectile) => projectile.id)).toEqual(
      originalIds,
    );
    expect(originalIds).toEqual([3, 4]);
    expect(model.hashHex()).toBe(originalHash);
  });

  it("restores the effect id allocator after generated effects were removed", async () => {
    const model = await createBattleModel(
      "reimu",
      "marisa",
      ["spirit_strike_card"],
      "spirit_strike_card",
    );
    model.step(input({ activeCardPressed: true }));
    expect(model.effects.map((effect) => effect.id)).toEqual([1]);
    model.effects.length = 0;
    model.player.activeCardCooldownUntil = 0;
    const snapshot = model.serialize();
    const action = input({ activeCardPressed: true });

    model.step(action);
    const originalIds = model.effects.map((effect) => effect.id);
    const originalHash = model.hashHex();

    model.deserialize(snapshot);
    model.step(action);

    expect(model.effects.map((effect) => effect.id)).toEqual(originalIds);
    expect(originalIds).toEqual([2]);
    expect(model.hashHex()).toBe(originalHash);
  });
});

describe("BattleModel reload timing", () => {
  it("reimu reloads from current ammo one round at a time", async () => {
    const model = await createBattleModel("reimu", "marisa");
    model.step(input({ shootPressed: true }));
    for (let index = 0; index < 10; index += 1) {
      model.step(input());
    }
    model.step(input({ shootPressed: true }));
    expect(model.player.ammo).toBe(3);

    model.step(input({ reloadPressed: true }));

    expect(model.player.reloadStartedAmmo).toBe(3);
    expect(model.player.reloadTotal).toBe(96);
    expect(model.player.reloadRemaining).toBe(96);
    expect(model.player.ammo).toBe(3);

    for (
      let index = 0;
      index < 500 && model.player.reloadRemaining > 0;
      index += 1
    ) {
      model.step(input());
    }

    expect(model.player.ammo).toBe(5);
  });

  it("marisa discards current ammo and only restores at the end", async () => {
    const model = await createBattleModel("marisa", "reimu");
    model.step(input({ shootPressed: true }));
    expect(model.player.ammo).toBe(1);

    model.step(input({ reloadPressed: true }));

    expect(model.player.reloadStartedAmmo).toBe(0);
    expect(model.player.reloadTotal).toBe(180);
    expect(model.player.reloadRemaining).toBe(180);
    expect(model.player.ammo).toBe(0);

    for (
      let index = 0;
      index < 500 && model.player.reloadRemaining > 0;
      index += 1
    ) {
      model.step(input());
    }

    expect(model.player.ammo).toBe(2);
  });

  it("sakuya keeps current ammo and only restores at the end", async () => {
    const model = await createBattleModel("sakuya", "reimu");
    model.step(input({ shootPressed: true }));
    expect(model.player.ammo).toBe(2);

    model.step(input({ reloadPressed: true }));

    expect(model.player.reloadStartedAmmo).toBe(2);
    expect(model.player.reloadTotal).toBe(60);
    expect(model.player.reloadRemaining).toBe(60);
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
    expect(model.player.reloadTotal).toBe(120);
    expect(model.player.reloadRemaining).toBe(120);
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
    expect(model.player.reloadTotal).toBe(180);
    expect(model.player.reloadRemaining).toBe(180);
    expect(model.player.ammo).toBe(0);
  });

  it("blocks shooting while a reload is active", async () => {
    const model = await createBattleModel("reimu", "marisa");
    model.step(input({ shootPressed: true }));
    for (let index = 0; index < 10; index += 1) {
      model.step(input());
    }
    model.step(input({ shootPressed: true }));

    const shotsBeforeReload = model.player.shotsFired;
    model.step(input({ reloadPressed: true }));
    model.step(input({ shootPressed: true }));

    expect(model.player.shotsFired).toBe(shotsBeforeReload);
  });

  it("starts reload when left click is pressed after ammo is empty", async () => {
    const model = await createBattleModel("marisa", "reimu");
    model.step(input({ shootPressed: true }));
    for (let index = 0; index < 20; index += 1) {
      model.step(input());
    }
    model.step(input({ shootPressed: true }));

    expect(model.player.ammo).toBe(0);

    model.step(input({ shootPressed: true }));

    expect(model.player.reloadStartedAmmo).toBe(0);
    expect(model.player.reloadTotal).toBe(180);
    expect(model.player.reloadRemaining).toBe(180);
  });
});

describe("BattleModel hit recovery", () => {
  it("applies extra life's initialization callback", async () => {
    const model = await createBattleModel("reimu", "marisa", ["extra_life"]);

    expect(model.player.lives).toBe(3);
  });

  it("restores bombs to the default count after taking a hit", async () => {
    const model = await createBattleModel("reimu", "marisa");
    model.player.bombs = 0;

    hitPlayer(model);

    expect(model.player.lives).toBe(1);
    expect(model.player.bombs).toBe(3);
  });

  it("restores bombs to ember's default count after taking a hit", async () => {
    const model = await createBattleModel("reimu", "marisa", ["ember"]);
    expect(model.player.bombs).toBe(4);
    model.player.bombs = 0;

    hitPlayer(model);

    expect(model.player.lives).toBe(1);
    expect(model.player.bombs).toBe(4);
  });

  it("does not end the battle when Player1 drops from 1 life to 0", async () => {
    const model = await createBattleModel("reimu", "marisa");
    model.player.lives = 1;

    hitPlayer(model);

    expect(model.player.lives).toBe(0);
    expect(model.player.deaths).toBe(0);
    expect(model.gameOver).toBe(false);

    model.player.invulnerableUntil = 0;
    hitPlayer(model);

    expect(model.player.lives).toBe(0);
    expect(model.player.deaths).toBe(1);
    expect(model.gameOver).toBe(true);
  });

  it("uses the same 0-life defeat timing for Player2", async () => {
    const model = await createBattleModel("reimu", "marisa");
    model.target.lives = 1;

    hitTarget(model);

    expect(model.target.lives).toBe(0);
    expect(model.target.deaths).toBe(0);
    expect(model.target.deadUntil).toBe(0);
    expect(model.gameOver).toBe(false);

    model.target.invulnerableUntil = 0;
    hitTarget(model);

    expect(model.target.lives).toBe(0);
    expect(model.target.deaths).toBe(1);
    expect(model.gameOver).toBe(true);
  });
});

describe("BattleModel ability cards", () => {
  it("adds multi-shot's extra homing bullet after a normal shot", async () => {
    const model = await createBattleModel("reimu", "marisa", ["multi_shot"]);

    model.step(input({ shootPressed: true }));

    expect(model.projectiles).toHaveLength(4);
    expect(
      model.projectiles.some(
        (projectile) => projectile.width === 18 && projectile.height === 10,
      ),
    ).toBe(true);
  });

  it("clears nearby bullets with spirit strike", async () => {
    const model = await createBattleModel(
      "reimu",
      "marisa",
      ["spirit_strike_card"],
      "spirit_strike_card",
    );
    model.projectiles.push(
      testProjectile({
        id: 1,
        owner: "Player2",
        x: model.player.x,
        y: model.player.y,
      }),
    );

    model.step(input({ activeCardPressed: true }));

    expect(model.projectiles).toHaveLength(0);
    expect(model.player.activeCardUses).toBe(2);
  });

  it("clears ordinary bullets behind the fighter with backdoor", async () => {
    const model = await createBattleModel("reimu", "marisa", ["backdoor"]);
    model.player.facing = 0;
    const shield = model.toOutputState().shields[0]!;
    model.projectiles.push(
      testProjectile({ id: 1, owner: "Player2", x: shield.x, y: shield.y }),
    );

    model.step(input({ aimX: model.player.x + 100, aimY: model.player.y }));

    expect(model.projectiles).toHaveLength(0);
    expect(model.toOutputState().shields).toHaveLength(1);
  });

  it("only lets backdoor clear visible damaging ordinary enemy bullets", async () => {
    const model = await createBattleModel("reimu", "marisa", ["backdoor"]);
    model.player.facing = 0;
    const shield = model.toOutputState().shields[0]!;
    model.projectiles.push(
      testProjectile({ id: 1, owner: "Player2", x: shield.x, y: shield.y }),
      testProjectile({ id: 2, owner: "Player1", x: shield.x, y: shield.y }),
      testProjectile({
        id: 3,
        owner: "Player2",
        kind: "spark",
        x: shield.x,
        y: shield.y,
      }),
      testProjectile({
        id: 4,
        owner: "Player2",
        x: shield.x,
        y: shield.y,
        visibleFrom: 999,
      }),
      testProjectile({
        id: 5,
        owner: "Player2",
        x: shield.x,
        y: shield.y,
        damage: 0,
      }),
    );

    model.step(input({ aimX: model.player.x + 100, aimY: model.player.y }));

    expect(
      model.projectiles
        .map((projectile) => projectile.id)
        .sort((left, right) => left - right),
    ).toEqual([2, 3, 4, 5]);
  });

  it("replays backdoor shield clears deterministically after rollback", async () => {
    const model = await createBattleModel("reimu", "marisa", ["backdoor"]);
    model.player.facing = 0;
    const shield = model.toOutputState().shields[0]!;
    model.projectiles.push(
      testProjectile({ id: 1, owner: "Player2", x: shield.x, y: shield.y }),
    );
    const snapshot = model.serialize();
    const action = input({ aimX: model.player.x + 100, aimY: model.player.y });

    model.step(action);
    const originalHash = model.hashHex();
    expect(model.projectiles).toHaveLength(0);

    model.deserialize(snapshot);
    model.step(action);

    expect(model.projectiles).toHaveLength(0);
    expect(model.hashHex()).toBe(originalHash);
  });

  it("awards graze points through the physics graze circle once per projectile", async () => {
    const model = await createBattleModel("reimu", "marisa");
    model.projectiles.push(
      testProjectile({
        id: 1,
        owner: "Player2",
        x: model.player.x + 9.5,
        y: model.player.y,
        width: 2,
        previousWidth: 2,
        height: 2,
        pausedUntil: 999,
      }),
    );

    model.step(input());
    model.step(input());

    expect(model.player.pointCount).toBe(2);
    expect(model.player.grazedProjectileIds).toEqual([1]);
    expect(model.player.lives).toBe(2);
  });

  it("keeps hit resolution ahead of graze resolution", async () => {
    const model = await createBattleModel("reimu", "marisa");
    model.projectiles.push(
      testProjectile({
        id: 1,
        owner: "Player2",
        x: model.player.x + 4,
        y: model.player.y,
        width: 2,
        previousWidth: 2,
        height: 2,
        pausedUntil: 999,
      }),
    );

    model.step(input());

    expect(model.player.lives).toBe(1);
    expect(model.player.pointCount).toBe(0);
    expect(model.player.grazedProjectileIds).toEqual([]);
  });

  it("extends the physics graze circle with graze lover", async () => {
    const baseline = await createBattleModel("reimu", "marisa");
    baseline.projectiles.push(
      testProjectile({
        id: 1,
        owner: "Neutral",
        x: baseline.player.x + 13,
        y: baseline.player.y,
        width: 2,
        previousWidth: 2,
        height: 2,
        pausedUntil: 999,
      }),
    );
    baseline.step(input());

    const boosted = await createBattleModel("reimu", "marisa", [
      "graze_lover",
    ]);
    boosted.projectiles.push(
      testProjectile({
        id: 1,
        owner: "Neutral",
        x: boosted.player.x + 13,
        y: boosted.player.y,
        width: 2,
        previousWidth: 2,
        height: 2,
        pausedUntil: 999,
      }),
    );
    boosted.step(input());

    expect(baseline.player.pointCount).toBe(0);
    expect(boosted.player.pointCount).toBe(1);
  });
});

describe("BattleModel character bombs", () => {
  it("reimu bomb clears nearby projectiles and leaves distant projectiles deterministic", async () => {
    const model = await createBattleModel("reimu", "marisa");
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

    expect(model.projectiles.some((projectile) => projectile.id === 100)).toBe(
      false,
    );
    expect(
      model.projectiles.find((projectile) => projectile.id === 101)?.x,
    ).toBe(model.player.x + 201);
    expect(model.effects.some((effect) => effect.kind === "ring")).toBe(true);
  });

  it("keeps bomb clear rings active for later projectiles and rollback", async () => {
    const model = await createBattleModel("reimu", "marisa");

    model.step(input({ bombPressed: true }));

    expect(model.clearRings).toHaveLength(1);
    expect(model.clearRings[0]).toMatchObject({
      owner: "Player1",
      radius: HIT_CIRCLE_DIAMETER * 16,
      followsOwner: false,
    });
    const snapshot = model.serialize();
    const snapshotHash = model.hashHex();

    model.projectiles.push(
      testProjectile({
        id: 500,
        owner: "Player2",
        x: model.player.x + HIT_CIRCLE_DIAMETER * 16 + 20,
        y: model.player.y,
        vx: -40,
      }),
      testProjectile({
        id: 501,
        owner: "Player2",
        x: model.player.x + HIT_CIRCLE_DIAMETER * 16 + 20,
        y: model.player.y,
        vx: -40,
        couldClear: false,
      }),
    );

    model.step(input());

    expect(model.projectiles.some((projectile) => projectile.id === 500)).toBe(
      false,
    );
    expect(model.projectiles.some((projectile) => projectile.id === 501)).toBe(
      true,
    );

    model.deserialize(snapshot);

    expect(model.clearRings).toHaveLength(1);
    expect(model.hashHex()).toBe(snapshotHash);
  });

  it("allows bomb use at the point threshold even with no bombs remaining", async () => {
    const model = await createBattleModel("reimu", "marisa");
    model.player.bombs = 0;
    model.setPlayerPointCount(300);

    model.step(input({ bombPressed: true }));

    expect(model.player.bombs).toBe(0);
    expect(model.player.pointCount).toBe(100);
    expect(model.player.bombUses).toBe(1);
    expect(model.stats.bombUses).toBe(1);
    expect(model.effects.some((effect) => effect.kind === "ring")).toBe(true);
  });

  it("spends points instead of a bomb when point count reaches the bomb threshold", async () => {
    const model = await createBattleModel("reimu", "marisa");
    model.setPlayerPointCount(300);

    model.step(input({ bombPressed: true }));

    expect(model.player.bombs).toBe(3);
    expect(model.player.pointCount).toBe(100);
    expect(model.player.bombUses).toBe(1);
  });

  it("spends a bomb below the point bomb threshold", async () => {
    const model = await createBattleModel("reimu", "marisa");
    model.setPlayerPointCount(299);

    model.step(input({ bombPressed: true }));

    expect(model.player.bombs).toBe(2);
    expect(model.player.pointCount).toBe(299);
    expect(model.player.bombUses).toBe(1);
  });

  it("blocks bomb use below the point bomb threshold when no bombs remain", async () => {
    const model = await createBattleModel("reimu", "marisa");
    model.player.bombs = 0;
    model.setPlayerPointCount(299);

    model.step(input({ bombPressed: true }));

    expect(model.player.bombs).toBe(0);
    expect(model.player.pointCount).toBe(299);
    expect(model.player.bombUses).toBe(0);
    expect(model.stats.bombUses).toBe(0);
  });

  it("marisa bomb does not pause an existing projectile while scheduling master spark", async () => {
    const model = await createBattleModel("marisa", "reimu");
    model.projectiles.push(
      testProjectile({
        id: 1,
        owner: "Player2",
        x: model.player.x + 200,
        y: model.player.y,
        vx: 1,
        pausedUntil: 0,
      }),
    );

    model.step(input({ bombPressed: true }));

    const existing = model.projectiles.find(
      (projectile) => projectile.id === 1,
    );
    expect(existing?.pausedUntil).toBe(0);
    expect(existing?.x).toBe(model.player.x + 201);

    const masterSpark = model.projectiles.find(
      (projectile) =>
        projectile.kind === "spark" && projectile.owner === "Player1",
    );
    expect(masterSpark?.visibleFrom).toBe(model.frame + 60);
    expect(masterSpark?.pausedUntil).toBe(model.frame + 60);
  });

  it("marisa master spark damages rectangular neutral targets without throwing", async () => {
    const model = await createBattleModel("marisa", "reimu");
    model.target.y = 600;
    const mob = new StaticRectNeutralMob(
      model.allocateNeutralMobId(),
      model.player.x + 200,
      model.player.y,
    );
    model.addNeutralMob(mob);

    model.step(
      input({ bombPressed: true, aimX: mob.state.x, aimY: mob.state.y }),
    );
    for (let index = 0; index < 60; index += 1) {
      model.step(input({ aimX: mob.state.x, aimY: mob.state.y }));
    }

    expect(mob.damageTaken).toBeGreaterThan(0);
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
        projectile.kind === "orb" && projectile.owner === "Player1",
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

  it("drives neutral mobs after Player1 and Player2 in stable mob id order", async () => {
    const model = await createBattleModel("reimu", "marisa");
    model.addNeutralMob(new TestNeutralMob(2, 640, 240));
    model.addNeutralMob(new TestNeutralMob(1, 640, 200));

    model.stepVersus(
      input({ shootPressed: true, aimX: model.target.x, aimY: model.target.y }),
      input({ shootPressed: true, aimX: model.player.x, aimY: model.player.y }),
    );

    expect(
      model.projectiles.map((projectile) => [
        projectile.id,
        projectile.owner,
        projectile.y,
      ]),
    ).toEqual([
      [1, "Player1", model.player.y],
      [2, "Player1", model.player.y],
      [3, "Player1", model.player.y],
      [4, "Player2", model.target.y],
      [5, "Player2", model.target.y],
      [6, "Player2", model.target.y],
      [7, "Neutral", 200],
      [8, "Neutral", 240],
    ]);
  });

  it("includes neutral mob state and id allocation in rollback snapshots and hashes", async () => {
    const model = await createBattleModel();
    const mob = new TestNeutralMob(model.allocateNeutralMobId(), 500, 120);
    model.addNeutralMob(mob);

    model.step(input());
    const snapshot = model.serialize();
    const snapshotHash = model.hashHex();

    model.step(input());
    const originalHash = model.hashHex();

    model.deserialize(snapshot);
    expect(model.hashHex()).toBe(snapshotHash);
    expect(model.getNextNeutralMobId()).toBe(2);

    model.step(input());
    expect(model.hashHex()).toBe(originalHash);
  });

  it("attributes neutral mob death using deterministic projectile consumption order", async () => {
    const model = await createBattleModel();
    const mob = new TestNeutralMob(model.allocateNeutralMobId(), 500, 120);
    mob.state.CurrentHealth = 2;
    model.addNeutralMob(mob);
    model.projectiles.push(
      testProjectile({
        id: 10,
        owner: "Player2",
        x: mob.state.x,
        y: mob.state.y,
        damage: 1,
      }),
      testProjectile({
        id: 11,
        owner: "Player1",
        x: mob.state.x,
        y: mob.state.y,
        damage: 1,
      }),
      testProjectile({
        id: 12,
        owner: "Player2",
        x: mob.state.x,
        y: mob.state.y,
        damage: 1,
      }),
    );

    model.step(input());

    expect(mob.deathSources).toEqual(["Player1"]);
    expect(model.neutralMobStates()).toHaveLength(0);
  });

  it("drops carried points when a neutral mob is killed", async () => {
    const model = await createBattleModel();
    const mob = new TestNeutralMob(model.allocateNeutralMobId(), 500, 120);
    mob.state.CurrentHealth = 1;
    mob.state.pointValue = 5;
    model.addNeutralMob(mob);
    model.projectiles.push(
      testProjectile({
        id: 10,
        owner: "Player1",
        x: mob.state.x,
        y: mob.state.y,
        damage: 1,
      }),
    );

    model.step(input());

    expect(model.points).toHaveLength(1);
    expect(model.points[0]).toMatchObject({ value: 5, size: 12 });
  });

  it("attributes neutral mob active self-removal to a null death source", async () => {
    const model = await createBattleModel();
    const mob = new TestNeutralMob(model.allocateNeutralMobId(), 500, 120);
    mob.state.ageTicks = 999;
    mob.state.pointValue = 10;
    model.addNeutralMob(mob);

    model.step(input());

    expect(mob.deathSources).toEqual([null]);
    expect(model.neutralMobStates()).toHaveLength(0);
    expect(model.points).toHaveLength(0);
  });
});

describe("BattleModel point pickups", () => {
  it("collects a nearby point after the visual collection delay", async () => {
    const model = await createBattleModel();
    model.addPoint(
      createPointState({
        id: model.allocatePointId(),
        x: model.player.x + 31,
        y: model.player.y,
        value: 1,
        vx: 0,
        vy: 0,
      }),
    );

    model.step(input());

    expect(model.points[0]?.collectingBy).toBe("Player1");
    expect(model.player.pointCount).toBe(0);

    for (let index = 0; index < 9; index += 1) {
      model.step(input());
    }
    expect(model.player.pointCount).toBe(0);

    model.step(input());

    expect(model.player.pointCount).toBe(1);
    expect(model.points).toHaveLength(0);
  });

  it("keeps collecting points at the point count limit without increasing the count", async () => {
    const model = await createBattleModel();
    model.player.pointCount = POINT_COUNT_MAX;
    model.addPoint(
      createPointState({
        id: model.allocatePointId(),
        x: model.player.x + 31,
        y: model.player.y,
        value: 5,
        vx: 0,
        vy: 0,
      }),
    );

    model.step(input());

    expect(model.points[0]?.collectingBy).toBe("Player1");

    for (let index = 0; index < 10; index += 1) {
      model.step(input());
    }

    expect(model.player.pointCount).toBe(POINT_COUNT_MAX);
    expect(model.points).toHaveLength(0);
  });

  it("uses Marisa's larger base point collection radius", async () => {
    const model = await createBattleModel("marisa", "reimu");
    model.addPoint(
      createPointState({
        id: model.allocatePointId(),
        x: model.player.x + 47,
        y: model.player.y,
        value: 1,
        vx: 0,
        vy: 0,
      }),
    );

    model.step(input());

    expect(model.points[0]?.collectingBy).toBe("Player1");
  });

  it("extends point collection radius through passive cards", async () => {
    const model = await createBattleModel("reimu", "marisa", ["extension"]);
    model.addPoint(
      createPointState({
        id: model.allocatePointId(),
        x: model.player.x + 47,
        y: model.player.y,
        value: 1,
        vx: 0,
        vy: 0,
      }),
    );

    model.step(input());

    expect(model.points[0]?.collectingBy).toBe("Player1");
  });

  it("restores point state and point id allocation in rollback snapshots and hashes", async () => {
    const model = await createBattleModel();
    model.addPoint(
      createPointState({
        id: model.allocatePointId(),
        x: 900,
        y: 200,
        value: 10,
        vx: 2,
        vy: 0,
      }),
    );

    model.step(input());
    const snapshot = model.serialize();
    const snapshotHash = model.hashHex();

    model.step(input());
    const originalHash = model.hashHex();

    model.deserialize(snapshot);
    expect(model.hashHex()).toBe(snapshotHash);
    expect(model.getNextPointId()).toBe(2);

    model.step(input());
    expect(model.hashHex()).toBe(originalHash);
  });
});

describe("BattleModel point power shooting tiers", () => {
  it("sets Player1 point directly for debug testing and clamps to the battle limit", async () => {
    const model = await createBattleModel();

    model.setPlayerPointCount(123.8);
    expect(model.player.pointCount).toBe(123);

    model.setPlayerPointCount(999);
    expect(model.player.pointCount).toBe(POINT_COUNT_MAX);

    model.setPlayerPointCount(-10);
    expect(model.player.pointCount).toBe(0);
  });

  it("upgrades Reimu shot counts by point tier", async () => {
    const tier1 = await shootOnceAtPoint("reimu", 0);
    expect(tier1.projectiles).toHaveLength(3);
    expect(
      tier1.projectiles.filter(
        (projectile) => projectile.homingUntil === projectile.homingStartAt,
      ),
    ).toHaveLength(1);

    const tier2 = await shootOnceAtPoint("reimu", 100);
    expect(tier2.projectiles).toHaveLength(4);

    const tier3 = await shootOnceAtPoint("reimu", 200);
    expect(tier3.projectiles).toHaveLength(6);
    expect(
      tier3.projectiles.filter(
        (projectile) => projectile.visibleFrom === tier3.frame + 8,
      ),
    ).toHaveLength(2);

    const tier4 = await shootOnceAtPoint("reimu", 300);
    expect(tier4.projectiles).toHaveLength(8);
    expect(
      tier4.projectiles.filter(
        (projectile) => projectile.visibleFrom === tier4.frame + 8,
      ),
    ).toHaveLength(4);
  });

  it("spawns Reimu bomb orbs immediately and moves them in delayed waves", async () => {
    const model = await createBattleModel("reimu", "marisa");
    model.player.facing = 0;

    model.step(
      input({
        bombPressed: true,
        aimX: model.player.x + 100,
        aimY: model.player.y,
      }),
    );

    const bombOrbs = model.projectiles
      .filter((projectile) => projectile.clearsProjectiles)
      .sort((left, right) => left.angle - right.angle);
    expect(bombOrbs).toHaveLength(5);
    expect(bombOrbs.every((projectile) => projectile.couldClear)).toBe(true);
    expect(bombOrbs.every((projectile) => projectile.piercesTargets)).toBe(
      true,
    );
    expect(
      bombOrbs.every(
        (projectile) =>
          projectile.width === HIT_CIRCLE_DIAMETER * 8 &&
          projectile.height === HIT_CIRCLE_DIAMETER * 8,
      ),
    ).toBe(true);
    expect(
      bombOrbs.filter(
        (projectile) =>
          projectile.visibleFrom === model.frame &&
          projectile.pausedUntil === model.frame + 30 &&
          projectile.retargetAt === model.frame + 30,
      ),
    ).toHaveLength(2);
    expect(
      bombOrbs.filter(
        (projectile) =>
          projectile.visibleFrom === model.frame &&
          projectile.pausedUntil === model.frame + 45 &&
          projectile.retargetAt === model.frame + 45,
      ),
    ).toHaveLength(3);
    expect(
      bombOrbs.map((projectile) =>
        Math.round((projectile.angle * 180) / Math.PI),
      ),
    ).toEqual([-30, 30, 120, 180, 240]);
    expect(
      bombOrbs.every(
        (projectile) =>
          Math.abs(
            Math.hypot(
              projectile.x - model.player.previousX,
              projectile.y - model.player.previousY,
            ) -
              HIT_CIRCLE_DIAMETER * 12,
          ) < 0.001,
      ),
    ).toBe(true);
  });

  it("aims Reimu bomb orbs once at the enemy when delayed movement starts", async () => {
    const model = await createBattleModel("reimu", "marisa");
    model.player.facing = 0;
    model.target.x = model.player.x;
    model.target.y = model.player.y + 200;

    model.step(input({ bombPressed: true }));

    const forwardOrb = model.projectiles.find(
      (projectile) =>
        projectile.clearsProjectiles &&
        projectile.pausedUntil === model.frame + 30,
    );
    expect(forwardOrb).toBeDefined();
    const startX = forwardOrb!.x;
    const startY = forwardOrb!.y;
    expect(forwardOrb!.visibleFrom).toBe(model.frame);

    for (let index = 0; index < 29; index += 1) {
      model.step(input());
    }

    expect(forwardOrb!.x).toBeCloseTo(startX);
    expect(forwardOrb!.y).toBeCloseTo(startY);

    model.target.x = startX;
    model.target.y = startY + 240;
    model.step(input());

    const retargetAngle = Math.atan2(
      model.target.y - startY,
      model.target.x - startX,
    );
    expect(forwardOrb!.retargetAt).toBeUndefined();
    expect(forwardOrb!.angle).toBeCloseTo(retargetAngle);
    const lockedVx = forwardOrb!.vx;
    const lockedVy = forwardOrb!.vy;

    model.target.x = startX + 240;
    model.target.y = startY;
    model.step(input());

    expect(forwardOrb!.vx).toBeCloseTo(lockedVx);
    expect(forwardOrb!.vy).toBeCloseTo(lockedVy);
  });

  it("keeps Reimu bomb orbs after a hit but still allows clearing them", async () => {
    const model = await createBattleModel("reimu", "marisa");
    model.step(input({ bombPressed: true }));

    const bombOrb = model.projectiles.find(
      (projectile) => projectile.clearsProjectiles,
    );
    expect(bombOrb).toBeDefined();
    model.target.x = bombOrb!.x;
    model.target.y = bombOrb!.y;

    model.step(input());

    expect(
      model.projectiles.some((projectile) => projectile.id === bombOrb!.id),
    ).toBe(true);

    clearProjectilesAround(
      model.projectiles,
      bombOrb!.x,
      bombOrb!.y,
      HIT_CIRCLE_DIAMETER * 16,
    );

    expect(
      model.projectiles.some((projectile) => projectile.id === bombOrb!.id),
    ).toBe(false);
  });

  it("applies piercing bullet damage every frame while overlapping", async () => {
    const model = await createBattleModel("reimu", "marisa");
    const mob = new StaticRectNeutralMob(
      model.allocateNeutralMobId(),
      500,
      240,
    );
    model.addNeutralMob(mob);
    model.projectiles.push(
      testProjectile({
        id: 10,
        owner: "Player1",
        x: mob.state.x,
        y: mob.state.y,
        damage: 5,
        piercesTargets: true,
      }),
    );

    model.step(input());
    expect(mob.damageTaken).toBe(5);
    expect(model.projectiles.some((projectile) => projectile.id === 10)).toBe(
      true,
    );

    model.step(input());

    expect(mob.damageTaken).toBe(10);
    expect(model.projectiles.some((projectile) => projectile.id === 10)).toBe(
      true,
    );
  });

  it("only clears projectiles marked as clearable", async () => {
    const model = await createBattleModel("reimu", "marisa");
    model.projectiles.push(
      testProjectile({
        id: 1,
        owner: "Player2",
        x: model.player.x,
        y: model.player.y,
      }),
      testProjectile({
        id: 2,
        owner: "Player2",
        x: model.player.x,
        y: model.player.y,
        couldClear: false,
      }),
    );

    clearProjectilesAround(
      model.projectiles,
      model.player.x,
      model.player.y,
      HIT_CIRCLE_DIAMETER * 16,
    );

    expect(model.projectiles.some((projectile) => projectile.id === 1)).toBe(
      false,
    );
    expect(model.projectiles.some((projectile) => projectile.id === 2)).toBe(
      true,
    );
  });

  it("adds Marisa rear beams and parallel lasers by point tier", async () => {
    const tier1 = await shootOnceAtPoint("marisa", 0);
    expect(tier1.projectiles).toHaveLength(1);
    expect(tier1.projectiles[0]?.couldClear).toBe(false);

    const tier2 = await shootOnceAtPoint("marisa", 100);
    expect(tier2.projectiles).toHaveLength(5);
    expect(
      tier2.projectiles.filter((projectile) => projectile.damage === 0),
    ).toHaveLength(2);
    const tier2RearBeams = tier2.projectiles
      .filter(
        (projectile) =>
          projectile.kind === "laser" &&
          projectile.damage === 5 &&
          !Number.isFinite(projectile.width),
      )
      .sort((left, right) => left.y - right.y);
    expect(tier2RearBeams).toHaveLength(2);
    expect(tier2RearBeams.map((projectile) => projectile.height)).toEqual([
      HIT_CIRCLE_DIAMETER * 2,
      HIT_CIRCLE_DIAMETER * 2,
    ]);
    expect(tier2RearBeams.map((projectile) => projectile.x)).toEqual([
      tier2.player.previousX - HIT_CIRCLE_DIAMETER * 16,
      tier2.player.previousX - HIT_CIRCLE_DIAMETER * 16,
    ]);
    expect(tier2RearBeams.map((projectile) => projectile.y)).toEqual([
      tier2.player.previousY - HIT_CIRCLE_DIAMETER * 8,
      tier2.player.previousY + HIT_CIRCLE_DIAMETER * 8,
    ]);

    const tier3 = await shootOnceAtPoint("marisa", 200);
    expect(
      tier3.projectiles.filter((projectile) =>
        Number.isFinite(projectile.width),
      ),
    ).toHaveLength(2);

    const tier4 = await shootOnceAtPoint("marisa", 300);
    expect(tier4.projectiles).toHaveLength(10);
    expect(
      tier4.projectiles.filter((projectile) => projectile.damage === 0),
    ).toHaveLength(4);
    const tier4RearBeams = tier4.projectiles.filter(
      (projectile) =>
        projectile.kind === "laser" &&
        projectile.damage === 5 &&
        !Number.isFinite(projectile.width),
    );
    expect(tier4RearBeams).toHaveLength(4);
    expect(
      tier4RearBeams
        .filter((projectile) => projectile.y < tier4.player.y)
        .map((projectile) => projectile.angle)
        .sort((left, right) => left - right),
    ).toEqual([-Math.PI / 18, 0]);
    expect(
      tier4RearBeams
        .filter((projectile) => projectile.y > tier4.player.y)
        .map((projectile) => projectile.angle)
        .sort((left, right) => left - right),
    ).toEqual([0, Math.PI / 18]);
    expect(
      tier4RearBeams.every(
        (projectile) =>
          projectile.x === tier4.player.previousX - HIT_CIRCLE_DIAMETER * 16,
      ),
    ).toBe(true);
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

  it("adds Cirno rear diamonds, center shot, repeat volley, and triple center by point tier", async () => {
    const tier1 = await shootOnceAtPoint("cirno", 0);
    expect(tier1.projectiles).toHaveLength(2);
    expect(
      tier1.projectiles.every(
        (projectile) =>
          projectile.kind === "diamond" &&
          projectile.width === HIT_CIRCLE_DIAMETER * 2 &&
          projectile.height === HIT_CIRCLE_DIAMETER * 2,
      ),
    ).toBe(true);

    const tier2 = await shootOnceAtPoint("cirno", 100);
    expect(tier2.projectiles).toHaveLength(3);

    const tier3 = await shootOnceAtPoint("cirno", 200);
    expect(tier3.projectiles).toHaveLength(5);
    expect(
      tier3.projectiles.filter(
        (projectile) => projectile.visibleFrom === tier3.frame + 6,
      ),
    ).toHaveLength(2);

    const tier4 = await shootOnceAtPoint("cirno", 300);
    expect(tier4.projectiles).toHaveLength(7);
    expect(
      tier4.projectiles.filter(
        (projectile) => projectile.visibleFrom === tier4.frame,
      ),
    ).toHaveLength(5);
  });

  it("turns nearby clearable enemy projectiles into Cirno high-speed diamonds and spends point bomb cost", async () => {
    const model = await createBattleModel("cirno", "reimu");
    model.setPlayerPointCount(250);
    model.projectiles.push(
      testProjectile({
        id: 100,
        owner: "Player2",
        x: model.player.x + HIT_CIRCLE_DIAMETER * 4,
        y: model.player.y,
      }),
      testProjectile({
        id: 101,
        owner: "Player2",
        x: model.player.x - HIT_CIRCLE_DIAMETER * 4,
        y: model.player.y,
      }),
      testProjectile({
        id: 102,
        owner: "Player2",
        x: model.player.x + HIT_CIRCLE_DIAMETER * 60,
        y: model.player.y,
      }),
      testProjectile({
        id: 103,
        owner: "Player2",
        x: model.player.x,
        y: model.player.y,
        couldClear: false,
      }),
    );

    model.step(input({ bombPressed: true }));

    expect(model.player.pointCount).toBe(100);
    expect(model.projectiles.some((projectile) => projectile.id === 100)).toBe(
      false,
    );
    expect(model.projectiles.some((projectile) => projectile.id === 101)).toBe(
      false,
    );
    expect(model.projectiles.some((projectile) => projectile.id === 102)).toBe(
      true,
    );
    expect(model.projectiles.some((projectile) => projectile.id === 103)).toBe(
      true,
    );

    const converted = model.projectiles.filter(
      (projectile) =>
        projectile.owner === "Player1" && projectile.kind === "diamond",
    );
    expect(converted).toHaveLength(2);
    expect(converted.every((projectile) => projectile.couldClear)).toBe(true);
    expect(converted.some((projectile) => projectile.vx > 0)).toBe(true);
    expect(converted.some((projectile) => projectile.vx < 0)).toBe(true);
  });
});

describe("BattlePhysics projectile collisions", () => {
  it("ignores projectile collisions with the owner fighter", async () => {
    const model = await createBattleModel();
    const physics = new BattlePhysics();
    await physics.init();

    model.target.x = model.player.x + 4;
    model.target.y = model.player.y;
    const projectile = testProjectile({
      id: 1,
      owner: "Player1",
      x: model.player.x,
      y: model.player.y,
      width: 120,
      height: 120,
    });

    const hits = physics.computeCollisions(
      [projectile],
      model.player,
      model.target,
    );

    expect(hits).toEqual([{ projectileId: 1, victimKey: "Player2" }]);
  });
});

describe("BattleModel homing projectiles", () => {
  it("limits homing turn speed to 180 degrees per second", async () => {
    const model = await createBattleModel();
    const projectile = testProjectile({
      id: 1,
      owner: "Player1",
      x: 100,
      y: 100,
      vx: 10,
      vy: 0,
      homingStartAt: 0,
      homingUntil: 10,
      angle: 0,
    });
    model.target.x = 100;
    model.target.y = 200;

    stepBulletProjectile(projectile, 0, model.target);

    expect(projectile.angle).toBeGreaterThan(0);
    expect(projectile.angle).toBeLessThanOrEqual(Math.PI / 60);
  });

  it("homes toward invulnerable target positions", async () => {
    const model = await createBattleModel();
    const projectile = testProjectile({
      id: 1,
      owner: "Player1",
      x: 100,
      y: 100,
      vx: 10,
      vy: 0,
      homingStartAt: 0,
      homingUntil: 10,
      angle: 0,
    });
    model.target.x = 100;
    model.target.y = 200;
    model.target.invulnerableUntil = 30;

    stepBulletProjectile(projectile, 0, model.target);

    expect(projectile.homingUntil).toBe(10);
    expect(projectile.angle).toBeGreaterThan(0);
  });

  it("retargets toward dead target positions", async () => {
    const model = await createBattleModel();
    const projectile = testProjectile({
      id: 1,
      owner: "Player1",
      x: 100,
      y: 100,
      vx: 10,
      vy: 0,
      retargetAt: 0,
      angle: 0,
    });
    model.target.x = 100;
    model.target.y = 200;
    model.target.deadUntil = 30;

    stepBulletProjectile(projectile, 0, model.target);

    expect(projectile.retargetAt).toBeUndefined();
    expect(projectile.angle).toBeGreaterThan(1.5);
    expect(projectile.angle).toBeLessThan(1.7);
  });
});

function createInputs(frames: number): BattleInputState[] {
  return Array.from({ length: frames }, (_, frame) => ({
    moveX: frame % 5 === 0 ? 1 : 0,
    moveY: frame % 7 === 0 ? -1 : 0,
    aimX: 900,
    aimY: 340,
    shootPressed: frame === 4 || frame === 14 || frame === 31,
    bombPressed: frame === 2,
    activeCardPressed: frame === 24,
    reloadPressed: frame === 18,
    alternateHeld: frame >= 36 && frame < 48,
    infoHeld: frame % 11 === 0,
  }));
}

function input(overrides: Partial<BattleInputState> = {}): BattleInputState {
  return {
    moveX: 0,
    moveY: 0,
    aimX: 900,
    aimY: 340,
    shootPressed: false,
    bombPressed: false,
    activeCardPressed: false,
    reloadPressed: false,
    alternateHeld: false,
    infoHeld: false,
    ...overrides,
  };
}

async function createBattleModel(
  primaryCharacterId: BattleLoadouts["player"]["primaryCharacterId"],
  alternateCharacterId: BattleLoadouts["player"]["alternateCharacterId"],
  cardIds?: BattleLoadouts["player"]["cardIds"],
  activeCardId?: BattleLoadouts["player"]["activeCardId"],
): Promise<BattleModel>;
async function createBattleModel(): Promise<BattleModel>;
async function createBattleModel(
  primaryCharacterId: BattleLoadouts["player"]["primaryCharacterId"] = "reimu",
  alternateCharacterId: BattleLoadouts["player"]["alternateCharacterId"] = "marisa",
  cardIds?: BattleLoadouts["player"]["cardIds"],
  activeCardId?: BattleLoadouts["player"]["activeCardId"],
): Promise<BattleModel> {
  const model = new BattleModel({
    player: {
      primaryCharacterId,
      alternateCharacterId,
      cardIds,
      activeCardId,
    },
    target: {
      primaryCharacterId: "reimu",
      alternateCharacterId: "marisa",
    },
  });
  const physics = new BattlePhysics();
  await physics.init();
  model.setPhysics(physics);
  return model;
}

async function shootOnceAtPoint(
  characterId: BattleLoadouts["player"]["primaryCharacterId"],
  pointCount: number,
): Promise<BattleModel> {
  const model = await createBattleModel(characterId, "reimu");
  model.setPlayerPointCount(pointCount);
  model.step(
    input({
      shootPressed: true,
      aimX: model.target.x,
      aimY: model.target.y,
    }),
  );
  return model;
}

function testProjectile(
  overrides: Partial<BattleModel["projectiles"][number]> & {
    readonly id: number;
    readonly owner: BattleModel["projectiles"][number]["owner"];
  },
) {
  return {
    kind: "orb" as const,
    x: 0,
    y: 0,
    previousX: 0,
    previousY: 0,
    vx: 0,
    vy: 0,
    width: 12,
    previousWidth: 12,
    height: 12,
    anchorX: undefined,
    anchorY: undefined,
    visibleFrom: 0,
    expireAt: undefined,
    homingStartAt: 999,
    homingUntil: 999,
    pausedUntil: 0,
    retargetAt: undefined,
    widthGrowthPerTick: 0,
    maxWidth: undefined,
    damage: 1,
    angle: 0,
    couldClear: true,
    clearsProjectiles: false,
    piercesTargets: false,
    ...overrides,
  };
}

class TestNeutralMob extends NeutralMob<
  NeutralMobState,
  BulletProjectileParams,
  LaserProjectileParams
> {
  readonly state: NeutralMobState;
  readonly deathSources: Array<"Player1" | "Player2" | "Neutral" | null> = [];

  constructor(id: number, x: number, y: number) {
    super();
    this.state = {
      id,
      key: "Neutral",
      kind: "test_mob",
      x,
      y,
      previousX: x,
      previousY: y,
      hitRadius: 10,
      waveId: 0,
      movementVariant: "",
      form: "idle",
      MaxHealth: 3,
      CurrentHealth: 3,
      active: true,
      ageTicks: 0,
      sfxFlags: 0,
    };
  }

  get flashAlpha(): number {
    return 0;
  }

  move(): void {
    this.state.x += 1;
  }

  fire(ctx: { spawnBullet(params: BulletProjectileParams): void }): void {
    ctx.spawnBullet({
      owner: "Neutral",
      kind: "orb",
      x: this.state.x,
      y: this.state.y,
      angle: 0,
      frame: 0,
      speedRank: "low",
      width: 8,
      height: 8,
      homingTicks: 0,
    });
  }

  switchForm(): void {
    if (this.state.ageTicks === 2) {
      this.state.form = "armed";
    }
  }

  die(): void {
    if (this.state.CurrentHealth <= 0 || this.state.ageTicks >= 1000) {
      this.state.active = false;
    }
  }

  onProjectileHit(damage: number): "accepted" | "ignored" {
    if (!this.state.active) {
      return "ignored";
    }
    this.state.CurrentHealth -= damage;
    if (this.state.CurrentHealth <= 0) {
      this.state.active = false;
    }
    return "accepted";
  }

  onDeath(source: "Player1" | "Player2" | "Neutral" | null): void {
    this.deathSources.push(source);
  }
}

class StaticRectNeutralMob extends NeutralMob<
  NeutralMobState,
  BulletProjectileParams,
  LaserProjectileParams
> {
  readonly state: NeutralMobState;
  damageTaken = 0;

  constructor(id: number, x: number, y: number) {
    super();
    this.state = {
      id,
      key: "Neutral",
      kind: "static_rect_mob",
      x,
      y,
      previousX: x,
      previousY: y,
      hitRadius: 24,
      hitWidth: 48,
      hitHeight: 48,
      waveId: 0,
      movementVariant: "",
      form: "idle",
      MaxHealth: 999,
      CurrentHealth: 999,
      active: true,
      ageTicks: 0,
      sfxFlags: 0,
    };
  }

  get flashAlpha(): number {
    return 0;
  }

  move(): void {
    this.state.previousX = this.state.x;
    this.state.previousY = this.state.y;
  }

  fire(): void {
    // Static test target does not fire.
  }

  switchForm(): void {
    // Static test target keeps one form.
  }

  die(): void {
    // Static test target stays active.
  }

  onProjectileHit(damage: number): "accepted" | "ignored" {
    if (damage <= 0) {
      return "ignored";
    }
    this.damageTaken += damage;
    return "accepted";
  }

  onDeath(): void {
    // Static test target never dies.
  }
}

function hitPlayer(model: BattleModel): void {
  const hit = model as unknown as {
    onProjectileHit(ctx: {
      readonly owner: "Player1" | "Player2";
      readonly victim: BattleModel["player"];
      readonly damage: number;
    }): boolean;
  };
  hit.onProjectileHit({ owner: "Player2", victim: model.player, damage: 1 });
}

function hitTarget(model: BattleModel): void {
  const hit = model as unknown as {
    onProjectileHit(ctx: {
      readonly owner: "Player1" | "Player2";
      readonly victim: BattleModel["target"];
      readonly damage: number;
    }): boolean;
  };
  hit.onProjectileHit({ owner: "Player1", victim: model.target, damage: 1 });
}
