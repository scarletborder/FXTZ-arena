import { describe, expect, it, vi } from "vitest";

import {
  ExampleFairy,
  NeutralMobSpawner,
  resolveMobSpawner,
  type BattleNeutralMob,
  type NeutralMobSpawnerContext,
  type NeutralMobSpawnerState,
} from "@repo/content";
import {
  ARENA_HEIGHT,
  ARENA_WIDTH,
  GRAZE_CIRCLE_DIAMETER,
  HIT_CIRCLE_DIAMETER,
  POINT_REWARD_VALUES,
  MONEY_REWARD_VALUES,
  COLLABORATE_GRAZE_SCORE,
  COLLABORATE_MOB_SCORE_VALUES,
  COLLABORATE_MONEY_PICKUP_SCORE_VALUES,
  COLLABORATE_ARENA_BOUNDS,
  PLAYER_CORE_RADIUS,
  PLAYER_SPAWN,
  TARGET_SPAWN,
} from "@repo/constants";
import { POINT_COUNT_MAX } from "../constants";
import { getAbilityCard } from "../content";
import { BattleModel } from ".";
import { BattlePhysics } from "./physics-adapter";
import { createMoneyState, createPointState } from "./points";
import { createRaidLogicRuntime } from "../runtime";
import { stepBulletProjectile } from "./projectile/bullet";
import { clearProjectilesAround } from "./projectile";
import type { NeutralMobState } from "@repo/types";
import {
  createBattleModel,
  createBattleModelWithSpawner,
  createInputs,
  HiddenCounterSpawner,
  hitPlayer,
  hitTarget,
  initializeBattleModel,
  input,
  StaticRectNeutralMob,
  testProjectile,
  TestNeutralMob,
} from "./test/helpers";

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
      1, 2, 3,
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
    expect(originalIds).toEqual([4, 5, 6]);
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

  it("restores queued neutral mob volleys after rollback", async () => {
    const model = await createBattleModel();
    const mob = new ExampleFairy({
      id: model.neutralMobManager.allocateNeutralMobId(),
      waveId: 1,
      movementVariant: "left",
    });
    mob.state.ageTicks = 10;
    mob.queueVolleyAt(12);
    model.neutralMobManager.addNeutralMob(mob);

    const snapshot = model.serialize();
    const snapshotHash = model.hashHex();

    model.step(input());
    model.step(input());
    const originalHash = model.hashHex();
    const originalProjectiles = model.projectiles.map((projectile) => ({
      id: projectile.id,
      owner: projectile.owner,
      x: projectile.x,
      y: projectile.y,
      angle: projectile.angle,
    }));

    model.deserialize(snapshot);

    expect(model.hashHex()).toBe(snapshotHash);

    model.step(input());
    model.step(input());

    expect(
      model.projectiles.map((projectile) => ({
        id: projectile.id,
        owner: projectile.owner,
        x: projectile.x,
        y: projectile.y,
        angle: projectile.angle,
      })),
    ).toEqual(originalProjectiles);
    expect(model.hashHex()).toBe(originalHash);
  });

  it("restores neutral mob spawner state after rollback", async () => {
    const spawner = new HiddenCounterSpawner();
    const model = await createBattleModelWithSpawner(spawner);
    model.step(input());

    const snapshot = model.serialize();
    const snapshotHash = model.hashHex();

    model.step(input());
    model.step(input());
    const originalMobIds = model.neutralMobManager
      .states()
      .map((mob) => mob.id);
    const originalHash = model.hashHex();

    model.deserialize(snapshot);

    expect(model.hashHex()).toBe(snapshotHash);

    model.step(input());
    model.step(input());

    expect(model.neutralMobManager.states().map((mob) => mob.id)).toEqual(
      originalMobIds,
    );
    expect(model.hashHex()).toBe(originalHash);
  });

  it("allocates neutral mob ids from wave id and member index", async () => {
    const model = await createBattleModel();

    expect(
      model.neutralMobManager.allocateNeutralMobId({
        waveId: 2,
        waveMemberIndex: 4,
      }),
    ).toBe(2005);
    expect(
      model.neutralMobManager.allocateNeutralMobId({
        waveId: 2,
        waveMemberIndex: 4,
      }),
    ).toBe(2005);
  });

  it("omits collaborate extra state from versus snapshots", async () => {
    const model = await createBattleModel();

    expect(model.serialize().collaborateExtra).toBeUndefined();
  });

  it("serializes and restores collaborate transition ready state", async () => {
    const model = await initializeBattleModel(
      new BattleModel(undefined, { battleMode: "collaborate", seed: 2468 }),
    );
    model.beginCollaborateTransition("boss", "manual");
    model.stepVersus(input({ transitionReadyPressed: true }), input());

    const snapshot = model.serialize();
    expect(snapshot.collaborateExtra).toMatchObject({
      state: "transition_sync",
      pendingTransitionTarget: "boss",
      transitionType: "manual",
      transitionReadyFrame: 30,
      player1TransitionReady: true,
      player2TransitionReady: false,
      spawnerRngState: "2468",
      cardDrawSeed: 2468,
    });

    model.stepVersus(input(), input({ transitionReadyPressed: true }));
    expect(model.serialize().collaborateExtra).toMatchObject({
      state: "transition_sync",
      player1TransitionReady: true,
      player2TransitionReady: true,
    });
    for (let frame = model.frame; frame < 30; frame += 1) {
      model.stepVersus(input(), input());
    }
    expect(model.serialize().collaborateExtra?.state).toBe("running");

    model.deserialize(snapshot);

    expect(model.serialize().collaborateExtra).toMatchObject({
      state: "transition_sync",
      pendingTransitionTarget: "boss",
      transitionType: "manual",
      player1TransitionReady: true,
      player2TransitionReady: false,
    });
  });

  it("clears neutral hazards only when the collaborate transition wait has elapsed", async () => {
    const model = await initializeBattleModel(
      new BattleModel(undefined, { battleMode: "collaborate", seed: 1357 }),
    );
    model.projectiles.push(
      testProjectile({ id: 1, owner: "Neutral" }),
      testProjectile({ id: 2, owner: "Player1" }),
    );
    model.neutralMobManager.addNeutralMob(new TestNeutralMob(100, 120, 140));

    model.beginCollaborateTransition("elite", "manual");
    model.stepVersus(
      input({ transitionReadyPressed: true }),
      input({ transitionReadyPressed: true }),
    );

    expect(model.serialize().collaborateExtra).toMatchObject({
      state: "transition_sync",
      player1TransitionReady: true,
      player2TransitionReady: true,
    });
    expect(model.projectiles.map((projectile) => projectile.owner)).toEqual([
      "Neutral",
      "Player1",
    ]);
    expect(model.neutralMobManager.states()).toHaveLength(1);

    for (let frame = model.frame; frame < 30; frame += 1) {
      model.stepVersus(input(), input());
    }

    expect(model.serialize().collaborateExtra?.state).toBe("running");
    expect(model.projectiles.map((projectile) => projectile.owner)).toEqual([
      "Player1",
    ]);
    expect(model.neutralMobManager.states()).toHaveLength(0);
  });
});

describe("BattleModel reload timing", () => {
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

  it("does not start reload from the model when shooting after ammo is empty", async () => {
    const model = await createBattleModel("marisa", "reimu");
    model.step(input({ shootPressed: true }));
    for (let index = 0; index < 20; index += 1) {
      model.step(input());
    }
    model.step(input({ shootPressed: true }));

    expect(model.player.ammo).toBe(0);

    model.step(input({ shootPressed: true }));

    expect(model.player.reloadRemaining).toBe(0);
    expect(model.player.shotsFired).toBe(2);
  });
});

describe("BattleModel hit recovery", () => {
  it("applies extra life's initialization callback", async () => {
    const model = await createBattleModel("reimu", "marisa", ["extra_life"]);

    expect(model.player.lives).toBe(4);
  });

  it("restores bombs to the default count after taking a hit", async () => {
    const model = await createBattleModel("reimu", "marisa");
    model.player.bombs = 0;

    hitPlayer(model);

    expect(model.player.lives).toBe(2);
    expect(model.player.bombs).toBe(3);
  });

  it("restores bombs to ember's default count after taking a hit", async () => {
    const model = await createBattleModel("reimu", "marisa", ["ember"]);
    expect(model.player.bombs).toBe(4);
    model.player.bombs = 0;

    hitPlayer(model);

    expect(model.player.lives).toBe(2);
    expect(model.player.bombs).toBe(4);
  });

  it("ends the battle when Player1 drops from 1 life to 0", async () => {
    const model = await createBattleModel("reimu", "marisa");
    model.player.lives = 1;

    hitPlayer(model);

    expect(model.player.lives).toBe(0);
    expect(model.player.deaths).toBe(1);
    expect(model.gameOver).toBe(true);
  });

  it("uses the same life defeat timing for Player2", async () => {
    const model = await createBattleModel("reimu", "marisa");
    model.target.lives = 1;

    hitTarget(model);

    expect(model.target.lives).toBe(0);
    expect(model.target.deaths).toBe(1);
    expect(model.gameOver).toBe(true);
  });

  it("keeps collaborate battles running after only one player is defeated", async () => {
    const model = await initializeBattleModel(
      new BattleModel(undefined, { battleMode: "collaborate" }),
    );
    model.player.lives = 0;

    hitPlayerWithNeutralProjectile(model);

    expect(model.player.deaths).toBe(1);
    expect(model.player.deadUntil).toBeGreaterThan(0);
    expect(model.gameOver).toBe(false);
    expect(model.result).toBe("running");
    expect(model.serialize().collaborateExtra?.state).toBe("running");
  });

  it("revives defeated collaborate players at the partner position with 1 life", async () => {
    const model = await initializeBattleModel(
      new BattleModel(undefined, { battleMode: "collaborate" }),
    );
    model.player.lives = 1;
    model.target.x = 321;
    model.target.y = 222;

    hitPlayerWithNeutralProjectile(model);
    model.beginCollaborateTransition("shop", "manual");
    model.stepVersus(
      { ...input(), transitionReadyPressed: true },
      { ...input(), transitionReadyPressed: true },
    );
    for (let frame = model.frame; frame < 61; frame += 1) {
      model.stepVersus(input(), input());
    }

    expect(model.player.lives).toBe(1);
    expect(model.player.deadUntil).toBe(0);
    expect(model.player.x).toBe(321);
    expect(model.player.y).toBe(222);
    expect(model.serialize().collaborateExtra?.shop.revivedByPlayerId.Player1).toBe(true);
    expect(model.serialize().collaborateExtra?.shop.readyByPlayerId.Player1).toBe(false);
  });

  it("clears neutral hazards only on the reconciled transition completion frame", async () => {
    const model = await initializeBattleModel(
      new BattleModel(undefined, { battleMode: "collaborate" }),
    );
    model.projectiles.push(
      testProjectile({ id: 1, owner: "Neutral", x: 120, y: 120 }),
      testProjectile({ id: 2, owner: "Player1", x: 140, y: 120 }),
    );
    model.neutralMobManager.addNeutralMob(
      new TestNeutralMob(model.neutralMobManager.allocateNeutralMobId(), 320, 240),
    );

    model.beginCollaborateTransition("shop", "manual");
    model.stepVersus(input({ transitionReadyPressed: true }), input());

    expect(model.projectiles.map((projectile) => projectile.id).sort()).toEqual([1, 2]);
    expect(model.neutralMobManager.states()).toHaveLength(1);

    model.stepVersus(input(), input({ transitionReadyPressed: true }));
    expect(model.projectiles.map((projectile) => projectile.id).sort()).toEqual([1, 2]);
    expect(model.neutralMobManager.states()).toHaveLength(1);

    for (let frame = model.frame; frame < 30; frame += 1) {
      model.stepVersus(input(), input());
    }

    expect(model.projectiles.map((projectile) => projectile.id)).toEqual([2]);
    expect(model.neutralMobManager.states()).toHaveLength(0);
  });

  it("does not fail collaborate when a revived player dies again while the partner is alive", async () => {
    const model = await initializeBattleModel(
      new BattleModel(undefined, { battleMode: "collaborate" }),
    );
    model.player.lives = 1;

    hitPlayerWithNeutralProjectile(model);
    model.beginCollaborateTransition("shop", "manual");
    model.stepVersus(
      { ...input(), transitionReadyPressed: true },
      { ...input(), transitionReadyPressed: true },
    );
    hitPlayerWithNeutralProjectile(model);

    expect(model.player.lives).toBe(0);
    expect(model.player.deadUntil).toBeGreaterThan(0);
    expect(model.target.deadUntil).toBe(0);
    expect(model.gameOver).toBe(false);
    expect(model.result).toBe("running");
  });

  it("fails collaborate battles when both players are defeated before the boss", async () => {
    const model = await initializeBattleModel(
      new BattleModel(undefined, { battleMode: "collaborate" }),
    );
    model.player.lives = 0;
    model.target.lives = 0;

    hitPlayerWithNeutralProjectile(model);
    hitTargetWithNeutralProjectile(model);

    expect(model.gameOver).toBe(true);
    expect(model.result).toBe("collaborate_defeat");
    expect(model.serialize().collaborateExtra).toMatchObject({
      state: "defeat",
      bossDefeated: false,
    });
  });

  it("wins collaborate battles as soon as the boss is marked defeated", async () => {
    const model = await initializeBattleModel(
      new BattleModel(undefined, { battleMode: "collaborate" }),
    );
    const snapshot = model.serialize();
    model.deserialize({
      ...snapshot,
      collaborateExtra: snapshot.collaborateExtra
        ? {
            ...snapshot.collaborateExtra,
            bossDefeated: true,
          }
        : undefined,
    });

    model.step(input());

    expect(model.gameOver).toBe(true);
    expect(model.result).toBe("collaborate_victory");
    expect(model.serialize().collaborateExtra).toMatchObject({
      state: "victory",
      bossDefeated: true,
    });
  });
});

function hitPlayerWithNeutralProjectile(model: BattleModel): void {
  const hit = model as unknown as {
    onProjectileHit(ctx: {
      readonly owner: "Neutral";
      readonly victim: BattleModel["player"];
      readonly damage: number;
    }): boolean;
  };
  hit.onProjectileHit({ owner: "Neutral", victim: model.player, damage: 1 });
}

function hitTargetWithNeutralProjectile(model: BattleModel): void {
  const hit = model as unknown as {
    onProjectileHit(ctx: {
      readonly owner: "Neutral";
      readonly victim: BattleModel["target"];
      readonly damage: number;
    }): boolean;
  };
  hit.onProjectileHit({ owner: "Neutral", victim: model.target, damage: 1 });
}

describe("BattleModel collaborate projectile rules", () => {
  it("lets Player1 projectiles pass through Player2 without damage in collaborate mode", async () => {
    const model = await initializeBattleModel(
      new BattleModel(undefined, { battleMode: "collaborate" }),
    );
    model.projectiles.push(
      testProjectile({
        id: 1,
        owner: "Player1",
        x: model.target.x,
        y: model.target.y,
        pausedUntil: 999,
      }),
    );

    model.stepVersus(input(), input());

    expect(model.target.lives).toBe(3);
    expect(model.projectiles.some((projectile) => projectile.id === 1)).toBe(
      true,
    );
  });

  it("lets Player2 projectiles pass through Player1 without damage in collaborate mode", async () => {
    const model = await initializeBattleModel(
      new BattleModel(undefined, { battleMode: "collaborate" }),
    );
    model.projectiles.push(
      testProjectile({
        id: 1,
        owner: "Player2",
        x: model.player.x,
        y: model.player.y,
        pausedUntil: 999,
      }),
    );

    model.stepVersus(input(), input());

    expect(model.player.lives).toBe(3);
    expect(model.projectiles.some((projectile) => projectile.id === 1)).toBe(
      true,
    );
  });

  it("keeps player projectiles damaging neutral mobs in collaborate mode", async () => {
    const model = await initializeBattleModel(
      new BattleModel(undefined, { battleMode: "collaborate" }),
    );
    const mob = new TestNeutralMob(
      model.neutralMobManager.allocateNeutralMobId(),
      500,
      120,
    );
    model.neutralMobManager.addNeutralMob(mob);
    model.projectiles.push(
      testProjectile({
        id: 1,
        owner: "Player1",
        x: mob.state.x,
        y: mob.state.y,
        damage: 1,
        pausedUntil: 999,
      }),
    );

    model.stepVersus(input(), input());

    expect(mob.state.CurrentHealth).toBe(2);
  });

  it("lets Neutral projectiles damage both players in collaborate mode", async () => {
    const model = await initializeBattleModel(
      new BattleModel(undefined, { battleMode: "collaborate" }),
    );
    model.projectiles.push(
      testProjectile({
        id: 1,
        owner: "Neutral",
        x: model.player.x,
        y: model.player.y,
        pausedUntil: 999,
      }),
      testProjectile({
        id: 2,
        owner: "Neutral",
        x: model.target.x,
        y: model.target.y,
        pausedUntil: 999,
      }),
    );

    model.stepVersus(input(), input());

    expect(model.player.lives).toBe(2);
    expect(model.target.lives).toBe(2);
  });

  it("keeps versus player projectiles damaging the opposing player", async () => {
    const model = await createBattleModel();
    model.projectiles.push(
      testProjectile({
        id: 1,
        owner: "Player1",
        x: model.target.x,
        y: model.target.y,
        pausedUntil: 999,
      }),
    );

    model.stepVersus(input(), input());

    expect(model.target.lives).toBe(2);
  });

  it("does not mutually clear Player1 and Player2 projectiles in collaborate mode", async () => {
    const model = await initializeBattleModel(
      new BattleModel(undefined, { battleMode: "collaborate" }),
    );
    model.projectiles.push(
      testProjectile({
        id: 1,
        owner: "Player1",
        x: 500,
        y: 240,
        clearsProjectiles: true,
        pausedUntil: 999,
      }),
      testProjectile({
        id: 2,
        owner: "Player2",
        x: 500,
        y: 240,
        pausedUntil: 999,
      }),
    );

    model.stepVersus(input(), input());

    expect(model.projectiles.map((projectile) => projectile.id).sort()).toEqual(
      [1, 2],
    );
  });
});

describe("BattleModel ability cards", () => {
  it("adds multi-shot's extra homing bullet after a normal shot", async () => {
    const model = await createBattleModel("reimu", "marisa", ["multi_shot"]);

    model.step(input({ shootPressed: true }));

    expect(model.projectiles).toHaveLength(4);
    expect(
      model.projectiles.some(
        (projectile) =>
          projectile.textureKey === "bullet_type_8_offset_0" &&
          projectile.width === 8 &&
          projectile.height === 8,
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
    expect(model.player.lives).toBe(3);
  });

  it("keeps projectiles alive while they are inside the expanded world padding", async () => {
    const model = await createBattleModel("reimu", "marisa");
    const padding = ARENA_WIDTH * 0.2;
    model.projectiles.push(
      testProjectile({
        id: 1,
        owner: "Player2",
        x: ARENA_WIDTH + padding - 1,
        y: ARENA_HEIGHT + padding - 1,
        pausedUntil: 999,
      }),
      testProjectile({
        id: 2,
        owner: "Player2",
        x: ARENA_WIDTH + padding + 1,
        y: ARENA_HEIGHT + padding + 1,
        pausedUntil: 999,
      }),
    );

    model.step(input());

    expect(model.projectiles.map((projectile) => projectile.id)).toEqual([1]);
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

    expect(model.player.lives).toBe(2);
    expect(model.player.pointCount).toBe(0);
    expect(model.player.grazedProjectileIds).toEqual([]);
  });

  it("extends the physics graze circle with graze lover", async () => {
    const baseline = await createBattleModel("reimu", "marisa");
    const grazeLoverOnlyDistance = GRAZE_CIRCLE_DIAMETER / 2 + 2;
    baseline.projectiles.push(
      testProjectile({
        id: 1,
        owner: "Neutral",
        x: baseline.player.x + grazeLoverOnlyDistance,
        y: baseline.player.y,
        width: 2,
        previousWidth: 2,
        height: 2,
        pausedUntil: 999,
      }),
    );
    baseline.step(input());

    const boosted = await createBattleModel("reimu", "marisa", ["graze_lover"]);
    boosted.projectiles.push(
      testProjectile({
        id: 1,
        owner: "Neutral",
        x: boosted.player.x + grazeLoverOnlyDistance,
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
      radius: HIT_CIRCLE_DIAMETER * 32,
      followsOwner: false,
    });
    const snapshot = model.serialize();
    const snapshotHash = model.hashHex();

    model.projectiles.push(
      testProjectile({
        id: 500,
        owner: "Player2",
        x: model.player.x + HIT_CIRCLE_DIAMETER * 32 + 20,
        y: model.player.y,
        vx: -40,
      }),
      testProjectile({
        id: 501,
        owner: "Player2",
        x: model.player.x + HIT_CIRCLE_DIAMETER * 32 + 20,
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
    model.pointManager.setPointCount(model.player, 300);

    model.step(input({ bombPressed: true }));

    expect(model.player.bombs).toBe(0);
    expect(model.player.pointCount).toBe(100);
    expect(model.player.bombUses).toBe(1);
    expect(model.stats.bombUses).toBe(1);
    expect(model.effects.some((effect) => effect.kind === "ring")).toBe(true);
  });

  it("spends points instead of a bomb when point count reaches the bomb threshold", async () => {
    const model = await createBattleModel("reimu", "marisa");
    model.pointManager.setPointCount(model.player, 300);

    model.step(input({ bombPressed: true }));

    expect(model.player.bombs).toBe(3);
    expect(model.player.pointCount).toBe(100);
    expect(model.player.bombUses).toBe(1);
  });

  it("spends a bomb below the point bomb threshold", async () => {
    const model = await createBattleModel("reimu", "marisa");
    model.pointManager.setPointCount(model.player, 299);

    model.step(input({ bombPressed: true }));

    expect(model.player.bombs).toBe(2);
    expect(model.player.pointCount).toBe(299);
    expect(model.player.bombUses).toBe(1);
  });

  it("blocks bomb use below the point bomb threshold when no bombs remain", async () => {
    const model = await createBattleModel("reimu", "marisa");
    model.player.bombs = 0;
    model.pointManager.setPointCount(model.player, 299);

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
      model.neutralMobManager.allocateNeutralMobId(),
      model.player.x + 200,
      model.player.y,
    );
    model.neutralMobManager.addNeutralMob(mob);

    model.step(
      input({ bombPressed: true, aimX: mob.state.x, aimY: mob.state.y }),
    );
    for (let index = 0; index < 60; index += 1) {
      model.step(input({ aimX: mob.state.x, aimY: mob.state.y }));
    }

    expect(mob.damageTaken).toBeGreaterThan(0);
  });

  it("drives neutral mobs after Player1 and Player2 in stable mob id order", async () => {
    const model = await createBattleModel("reimu", "marisa");
    model.neutralMobManager.addNeutralMob(new TestNeutralMob(2, 640, 240));
    model.neutralMobManager.addNeutralMob(new TestNeutralMob(1, 640, 200));

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
    const mob = new TestNeutralMob(
      model.neutralMobManager.allocateNeutralMobId(),
      500,
      120,
    );
    model.neutralMobManager.addNeutralMob(mob);

    model.step(input());
    const snapshot = model.serialize();
    const snapshotHash = model.hashHex();

    model.step(input());
    const originalHash = model.hashHex();

    model.deserialize(snapshot);
    expect(model.hashHex()).toBe(snapshotHash);
    expect(model.neutralMobManager.getNextNeutralMobId()).toBe(2);

    model.step(input());
    expect(model.hashHex()).toBe(originalHash);
  });

  it("attributes neutral mob death using deterministic projectile consumption order", async () => {
    const model = await createBattleModel();
    const mob = new TestNeutralMob(
      model.neutralMobManager.allocateNeutralMobId(),
      500,
      120,
    );
    mob.state.CurrentHealth = 2;
    model.neutralMobManager.addNeutralMob(mob);
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
    expect(model.neutralMobManager.states()).toHaveLength(0);
  });

  it("drops carried points when a neutral mob is killed", async () => {
    const model = await createBattleModel();
    const mob = new TestNeutralMob(
      model.neutralMobManager.allocateNeutralMobId(),
      500,
      120,
    );
    mob.state.CurrentHealth = 1;
    mob.state.pointRewardSize = "medium";
    model.neutralMobManager.addNeutralMob(mob);
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
    expect(model.points[0]).toMatchObject({
      value: POINT_REWARD_VALUES.medium,
      size: 25,
    });
  });

  it("attributes neutral mob active self-removal to a null death source", async () => {
    const model = await createBattleModel();
    const mob = new TestNeutralMob(
      model.neutralMobManager.allocateNeutralMobId(),
      500,
      120,
    );
    mob.state.ageTicks = 999;
    mob.state.pointRewardSize = "large";
    model.neutralMobManager.addNeutralMob(mob);

    model.step(input());

    expect(mob.deathSources).toEqual([null]);
    expect(model.neutralMobManager.states()).toHaveLength(0);
    expect(model.points).toHaveLength(0);
  });
});

describe("BattleModel point pickups", () => {
  it("collects a nearby point after the visual collection delay", async () => {
    const model = await createBattleModel();
    model.pointManager.addPoint(
      createPointState({
        id: model.pointManager.allocatePointId(),
        x: model.player.x + 31,
        y: model.player.y,
        rewardSize: "small",
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

    expect(model.player.pointCount).toBe(POINT_REWARD_VALUES.small);
    expect(model.points).toHaveLength(0);
  });

  it("keeps collecting points at the point count limit without increasing the count", async () => {
    const model = await createBattleModel();
    model.player.pointCount = POINT_COUNT_MAX;
    model.pointManager.addPoint(
      createPointState({
        id: model.pointManager.allocatePointId(),
        x: model.player.x + 31,
        y: model.player.y,
        rewardSize: "medium",
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
    model.pointManager.addPoint(
      createPointState({
        id: model.pointManager.allocatePointId(),
        x: model.player.x + 47,
        y: model.player.y,
        rewardSize: "small",
        vx: 0,
        vy: 0,
      }),
    );

    model.step(input());

    expect(model.points[0]?.collectingBy).toBe("Player1");
  });

  it("extends point collection radius through passive cards", async () => {
    const model = await createBattleModel("reimu", "marisa", ["extension"]);
    model.pointManager.addPoint(
      createPointState({
        id: model.pointManager.allocatePointId(),
        x: model.player.x + 47,
        y: model.player.y,
        rewardSize: "small",
        vx: 0,
        vy: 0,
      }),
    );

    model.step(input());

    expect(model.points[0]?.collectingBy).toBe("Player1");
  });

  it("restores point state and point id allocation in rollback snapshots and hashes", async () => {
    const model = await createBattleModel();
    model.pointManager.addPoint(
      createPointState({
        id: model.pointManager.allocatePointId(),
        x: 900,
        y: 200,
        rewardSize: "large",
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
    expect(model.pointManager.getNextPointId()).toBe(2);

    model.step(input());
    expect(model.hashHex()).toBe(originalHash);
  });
});

describe("BattleModel collaborate money and scoring", () => {
  it("applies configured initial money to both collaborate fighters and restores it on reset", async () => {
    const model = await initializeBattleModel(
      new BattleModel(undefined, {
        battleMode: "collaborate",
        playerInitMoney: 35,
        opponentInitMoney: 75,
      }),
    );

    expect(model.serialize().collaborateExtra?.moneyByPlayerId.Player1).toBe(
      35,
    );
    expect(model.serialize().collaborateExtra?.moneyByPlayerId.Player2).toBe(
      75,
    );

    const snapshot = model.serialize();
    model.deserialize({
      ...snapshot,
      collaborateExtra: snapshot.collaborateExtra
        ? {
            ...snapshot.collaborateExtra,
            moneyByPlayerId: {
              ...snapshot.collaborateExtra.moneyByPlayerId,
              Player1: 999,
            },
          }
        : undefined,
    });
    model.reset();

    expect(model.serialize().collaborateExtra?.moneyByPlayerId.Player1).toBe(
      35,
    );
    expect(model.serialize().collaborateExtra?.moneyByPlayerId.Player2).toBe(
      75,
    );
  });

  it("awards money pickups and pickup score only to the collecting player", async () => {
    const model = await initializeBattleModel(
      new BattleModel(undefined, { battleMode: "collaborate" }),
    );
    model.pointManager.addPoint(
      createMoneyState({
        id: model.pointManager.allocatePointId(),
        x: model.target.x + 31,
        y: model.target.y,
        rewardSize: "medium",
        vx: 0,
        vy: 0,
      }),
    );

    model.stepVersus(input(), input());
    expect(model.points[0]?.collectingBy).toBe("Player2");

    for (let index = 0; index < 10; index += 1) {
      model.stepVersus(input(), input());
    }

    const extra = model.serialize().collaborateExtra;
    expect(extra?.moneyByPlayerId.Player1).toBe(0);
    expect(extra?.moneyByPlayerId.Player2).toBe(MONEY_REWARD_VALUES.medium);
    expect(extra?.scoreByPlayerId.Player1).toBe(0);
    expect(extra?.scoreByPlayerId.Player2).toBe(
      COLLABORATE_MONEY_PICKUP_SCORE_VALUES.medium,
    );
  });

  it("replaces the active card when buying an active collaborate shop card", async () => {
    const model = await initializeBattleModel(
      new BattleModel(undefined, {
        battleMode: "collaborate",
        playerInitMoney: 100,
      }),
    );
    model.player.activeCard = undefined;
    model.player.abilityCards = [getAbilityCard("multi_shot"), getAbilityCard("spirit_strike_card")];
    model.player.activeCardUses = 0;
    model.player.activeCardCooldownUntil = 99;

    const snapshot = model.serialize();
    if (!snapshot.collaborateExtra) {
      throw new Error("collaborate extra state should exist");
    }
    model.deserialize({
      ...snapshot,
      collaborateExtra: {
        ...snapshot.collaborateExtra,
        shop: {
          ...snapshot.collaborateExtra.shop,
          open: true,
          shopIndex: 1,
          goodsByPlayerId: {
            ...snapshot.collaborateExtra.shop.goodsByPlayerId,
            Player1: [
              {
                id: "shop-1:Player1:card:spirit_strike_card",
                kind: "ability_card",
                price: 46,
                abilityCardId: "spirit_strike_card",
              },
            ],
          },
          purchasesByPlayerId: {
            ...snapshot.collaborateExtra.shop.purchasesByPlayerId,
            Player1: [],
          },
        },
        moneyByPlayerId: {
          ...snapshot.collaborateExtra.moneyByPlayerId,
          Player1: 100,
        },
      },
    });

    model.stepVersus(
      input({ shopPurchaseItemId: "shop-1:Player1:card:spirit_strike_card" }),
      input(),
    );

    const updated = model.serialize().player;
    expect(updated.activeCardId).toBe("spirit_strike_card");
    expect(updated.activeCardUses).toBe(3);
    expect(updated.activeCardCooldownUntil).toBe(0);
    expect(model.serialize().collaborateExtra?.moneyByPlayerId.Player1).toBe(54);
  });

  it("adds collaborate score when a player defeats a mob", async () => {
    const model = await initializeBattleModel(
      new BattleModel(undefined, { battleMode: "collaborate" }),
    );
    const mob = new TestNeutralMob(
      model.neutralMobManager.allocateNeutralMobId(),
      500,
      240,
    );
    mob.restore({ ...mob.state, class: "elite" });
    model.neutralMobManager.addNeutralMob(mob);
    model.projectiles.push(
      testProjectile({
        id: 10,
        owner: "Player1",
        x: mob.state.x,
        y: mob.state.y,
        damage: 10,
      }),
    );

    model.stepVersus(input(), input());

    expect(model.serialize().collaborateExtra?.scoreByPlayerId.Player1).toBe(
      COLLABORATE_MOB_SCORE_VALUES.elite,
    );
    expect(model.serialize().collaborateExtra?.scoreByPlayerId.Player2).toBe(0);
  });

  it("adds collaborate score when a player grazes a projectile", async () => {
    const model = await initializeBattleModel(
      new BattleModel(undefined, { battleMode: "collaborate" }),
    );
    const graze = model as unknown as {
      onProjectileGraze(ctx: {
        readonly owner: "Neutral";
        readonly victim: BattleModel["player"];
        readonly projectile: { readonly id: number };
      }): void;
    };

    graze.onProjectileGraze({
      owner: "Neutral",
      victim: model.player,
      projectile: { id: 123 },
    });

    expect(model.serialize().collaborateExtra?.scoreByPlayerId.Player1).toBe(
      COLLABORATE_GRAZE_SCORE,
    );
  });
});

describe("Example collaborate mob spawner", () => {
  it("is registered for the collaborate test arena and restores custom mobs", () => {
    const spawner = resolveMobSpawner("example-collaborate-mob-spawner");
    expect(spawner?.id).toBe("example-collaborate-mob-spawner");
    expect(spawner?.snapshot()).toMatchObject({
      spawnerId: "example-collaborate-mob-spawner",
      nodeIndex: 0,
    });
    if (!spawner) {
      throw new Error("example collaborate spawner should be registered");
    }
    const elite = spawner.createMobFromSnapshot({
      id: 1,
      key: "Neutral",
      kind: "collaborate_elite_fairy",
      class: "elite",
      displayName: "朴实精英",
      textureKey: "enemy_type_7",
      x: 0,
      y: 0,
      previousX: 0,
      previousY: 0,
      hitRadius: 65,
      waveId: 8,
      movementVariant: "plain",
      form: "non_spell",
      MaxHealth: 1,
      CurrentHealth: 1,
      active: true,
      ageTicks: 0,
      sfxFlags: 0,
      variant: "plain",
      side: "left",
      nextFireAge: 0,
      fireSubphase: 0,
    } as NeutralMobState & Record<string, unknown>);
    const boss = spawner.createMobFromSnapshot({
      id: 2,
      key: "Neutral",
      kind: "collaborate_boss_fairy",
      class: "boss",
      displayName: "疯狂boss",
      textureKey: "enemy_type_7",
      x: 0,
      y: 0,
      previousX: 0,
      previousY: 0,
      hitRadius: 76,
      waveId: 18,
      movementVariant: "boss",
      form: "non_spell",
      MaxHealth: 1,
      CurrentHealth: 1,
      active: true,
      ageTicks: 0,
      sfxFlags: 0,
      nextFireAge: 0,
      fireSubphase: 0,
      rngState: 1,
    } as NeutralMobState & Record<string, unknown>);

    expect(elite?.state.displayName).toBe("朴实精英");
    expect(boss?.state.class).toBe("boss");
  });

  it("closes the shop and advances the spawner when both players are ready", async () => {
    const model = await initializeBattleModel(
      new BattleModel(undefined, {
        battleMode: "collaborate",
        neutralMobSpawner: new ReadyShopSpawner(),
      }),
    );

    model.stepVersus(input(), input());
    model.stepVersus(
      input({ transitionReadyPressed: true }),
      input({ transitionReadyPressed: true }),
    );
    for (let frame = model.frame; frame < 61; frame += 1) {
      model.stepVersus(input(), input());
    }
    expect(model.serialize().collaborateExtra?.shop.open).toBe(true);

    model.stepVersus(
      input({ shopReadyPressed: true }),
      input({ shopReadyPressed: true }),
    );

    expect(model.serialize().collaborateExtra?.shop.open).toBe(false);
    expect(model.neutralMobManager.states()).toHaveLength(1);
    expect(model.neutralMobManager.states()[0]?.kind).toBe("test_mob");
  });
});

interface ReadyShopSpawnerState extends NeutralMobSpawnerState {
  readonly spawnerId: "ready-shop";
  readonly stage: number;
}

class ReadyShopSpawner extends NeutralMobSpawner<ReadyShopSpawnerState> {
  readonly id = "ready-shop";
  private stage = 0;

  step(ctx: NeutralMobSpawnerContext): void {
    if (this.stage === 0) {
      if (!ctx.collaborateExtra?.shop.open) {
        ctx.updateCollaborateExtra((extra) => ({
          ...extra,
          shop: {
            ...extra.shop,
            rarityPulls: {},
          },
        }));
        ctx.beginCollaborateTransition("shop", "auto");
        return;
      }

      const ready = ctx.collaborateExtra.shop.readyByPlayerId;
      if (ready.Player1 && ready.Player2) {
        this.stage = 1;
        ctx.updateCollaborateExtra((extra) => ({
          ...extra,
          shop: {
            ...extra.shop,
            open: false,
            readyByPlayerId: {
              Player1: false,
              Player2: false,
              Neutral: false,
            },
          },
        }));
      }
      return;
    }

    if (this.stage === 1) {
      ctx.spawnMob(new TestNeutralMob(ctx.allocateMobId(), 320, 240));
      this.stage = 2;
    }
  }

  snapshot(): ReadyShopSpawnerState {
    return {
      spawnerId: this.id,
      stage: this.stage,
    };
  }

  restore(snapshot: ReadyShopSpawnerState): void {
    this.stage = snapshot.stage;
  }

  reset(): void {
    this.stage = 0;
  }

  createMobFromSnapshot(
    snapshot: NeutralMobState,
  ): BattleNeutralMob | undefined {
    if (snapshot.kind !== "test_mob") {
      return undefined;
    }
    const mob = new TestNeutralMob(snapshot.id, snapshot.x, snapshot.y);
    mob.restore(snapshot);
    return mob;
  }
}

describe("BattleModel point power shooting tiers", () => {
  it("applies configured initial points to both fighters and restores them on reset", async () => {
    const model = await initializeBattleModel(
      new BattleModel(undefined, {
        playerInitPoint: 35,
        opponentInitPoint: 75,
      }),
    );

    expect(model.player.pointCount).toBe(35);
    expect(model.target.pointCount).toBe(75);

    model.pointManager.setPointCount(model.player, 120);
    model.target.pointCount = 10;
    model.reset();

    expect(model.player.pointCount).toBe(35);
    expect(model.target.pointCount).toBe(75);
  });

  it("sets Player1 point directly for debug testing and clamps to the battle limit", async () => {
    const model = await createBattleModel();

    model.pointManager.setPointCount(model.player, 123.8);
    expect(model.player.pointCount).toBe(123);

    model.pointManager.setPointCount(model.player, 999);
    expect(model.player.pointCount).toBe(POINT_COUNT_MAX);

    model.pointManager.setPointCount(model.player, -10);
    expect(model.player.pointCount).toBe(0);
  });

  it("applies piercing bullet damage every frame while overlapping", async () => {
    const model = await createBattleModel("reimu", "marisa");
    const mob = new StaticRectNeutralMob(
      model.neutralMobManager.allocateNeutralMobId(),
      500,
      240,
    );
    model.neutralMobManager.addNeutralMob(mob);
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
});

describe("BattleModel arena bounds", () => {
  it("uses versus spawn points for normal map runtimes", async () => {
    const runtime = createRaidLogicRuntime({
      mode: "ai",
      mapId: "hakurei_shrine",
      battleMode: "versus",
    });
    await runtime.initialize();

    expect(runtime.state.player.x).toBe(PLAYER_SPAWN.x);
    expect(runtime.state.player.y).toBe(PLAYER_SPAWN.y);
    expect(runtime.state.target.x).toBe(TARGET_SPAWN.x);
    expect(runtime.state.target.y).toBe(TARGET_SPAWN.y);
  });

  it("uses collaborate map spawn points when the runtime is created for the collaborate arena", async () => {
    const runtime = createRaidLogicRuntime({
      mode: "online",
      mapId: "collaborate_test_arena",
      battleMode: "collaborate",
    });
    await runtime.initialize();

    expect(runtime.state.player.x).toBe(1200);
    expect(runtime.state.player.y).toBe(720);
    expect(runtime.state.target.x).toBe(1200);
    expect(runtime.state.target.y).toBe(720);
    expect(runtime.serialize().mobSpawner).toMatchObject({
      spawnerId: "example-collaborate-mob-spawner",
    });
  });

  it("clamps fighter movement to injected collaborate arena bounds", async () => {
    const model = await initializeBattleModel(
      new BattleModel(undefined, {
        battleMode: "collaborate",
        arenaBounds: COLLABORATE_ARENA_BOUNDS,
        playerSpawn: { x: 2390, y: 1430 },
        targetSpawn: { x: 10, y: 10 },
      }),
    );

    for (let index = 0; index < 120; index += 1) {
      model.stepVersus(input({ moveX: 1, moveY: 1 }), input());
    }

    expect(model.player.x).toBeLessThanOrEqual(
      COLLABORATE_ARENA_BOUNDS.width - PLAYER_CORE_RADIUS,
    );
    expect(model.player.y).toBeLessThanOrEqual(
      COLLABORATE_ARENA_BOUNDS.height - PLAYER_CORE_RADIUS,
    );
  });

  it("keeps projectiles alive inside collaborate arena bounds", async () => {
    const model = await initializeBattleModel(
      new BattleModel(undefined, {
        battleMode: "collaborate",
        arenaBounds: COLLABORATE_ARENA_BOUNDS,
      }),
    );
    const padding = COLLABORATE_ARENA_BOUNDS.width * 0.2;
    model.projectiles.push(
      testProjectile({
        id: 1,
        owner: "Neutral",
        x: COLLABORATE_ARENA_BOUNDS.width + padding - 1,
        y: COLLABORATE_ARENA_BOUNDS.height + padding - 1,
        pausedUntil: 999,
      }),
      testProjectile({
        id: 2,
        owner: "Neutral",
        x: COLLABORATE_ARENA_BOUNDS.width + padding + 1,
        y: COLLABORATE_ARENA_BOUNDS.height + padding + 1,
        pausedUntil: 999,
      }),
    );

    model.stepVersus(input(), input());

    expect(model.projectiles.map((projectile) => projectile.id)).toEqual([1]);
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
