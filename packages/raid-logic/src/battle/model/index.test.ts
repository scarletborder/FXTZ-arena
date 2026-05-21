import { describe, expect, it, vi } from "vitest";

import type { BattleInputState } from "@repo/types";
import type { BattleLoadouts } from "../loadout";
import { BattleModel } from ".";
import { BattlePhysics } from "./physics-adapter";

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
    model.step(input({ shootPressed: true, aimX: model.player.x - 100, aimY: model.player.y }));
    expect(model.projectiles.map((projectile) => projectile.id)).toEqual([1, 2]);
    model.projectiles.length = 0;
    model.player.fireCooldownUntil = 0;
    const snapshot = model.serialize();
    const action = input({ shootPressed: true, aimX: model.player.x - 100, aimY: model.player.y });

    model.step(action);
    const originalIds = model.projectiles.map((projectile) => projectile.id);
    const originalHash = model.hashHex();

    model.deserialize(snapshot);
    model.step(action);

    expect(model.projectiles.map((projectile) => projectile.id)).toEqual(originalIds);
    expect(originalIds).toEqual([3, 4]);
    expect(model.hashHex()).toBe(originalHash);
  });

  it("restores the effect id allocator after generated effects were removed", async () => {
    const model = await createBattleModel("reimu", "marisa", ["spirit_strike_card"], "spirit_strike_card");
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

    for (let index = 0; index < 500 && model.player.reloadRemaining > 0; index += 1) {
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

    for (let index = 0; index < 500 && model.player.reloadRemaining > 0; index += 1) {
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

    for (let index = 0; index < 500 && model.player.reloadRemaining > 0; index += 1) {
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
});

describe("BattleModel ability cards", () => {
  it("adds multi-shot's extra homing bullet after a normal shot", async () => {
    const model = await createBattleModel("reimu", "marisa", ["multi_shot"]);

    model.step(input({ shootPressed: true }));

    expect(model.projectiles).toHaveLength(4);
    expect(model.projectiles.some((projectile) => projectile.width === 18 && projectile.height === 10)).toBe(true);
  });

  it("clears nearby bullets with spirit strike", async () => {
    const model = await createBattleModel("reimu", "marisa", ["spirit_strike_card"], "spirit_strike_card");
    model.projectiles.push(testProjectile({ id: 1, owner: "target", x: model.player.x, y: model.player.y }));

    model.step(input({ activeCardPressed: true }));

    expect(model.projectiles).toHaveLength(0);
    expect(model.player.activeCardUses).toBe(2);
  });

  it("clears ordinary bullets behind the fighter with backdoor", async () => {
    const model = await createBattleModel("reimu", "marisa", ["backdoor"]);
    model.player.facing = 0;
    const shield = model.toOutputState().shields[0]!;
    model.projectiles.push(testProjectile({ id: 1, owner: "target", x: shield.x, y: shield.y }));

    model.step(input({ aimX: model.player.x + 100, aimY: model.player.y }));

    expect(model.projectiles).toHaveLength(0);
    expect(model.toOutputState().shields).toHaveLength(1);
  });

  it("only lets backdoor clear visible damaging ordinary enemy bullets", async () => {
    const model = await createBattleModel("reimu", "marisa", ["backdoor"]);
    model.player.facing = 0;
    const shield = model.toOutputState().shields[0]!;
    model.projectiles.push(
      testProjectile({ id: 1, owner: "target", x: shield.x, y: shield.y }),
      testProjectile({ id: 2, owner: "player", x: shield.x, y: shield.y }),
      testProjectile({ id: 3, owner: "target", kind: "spark", x: shield.x, y: shield.y }),
      testProjectile({ id: 4, owner: "target", x: shield.x, y: shield.y, visibleFrom: 999 }),
      testProjectile({ id: 5, owner: "target", x: shield.x, y: shield.y, damage: 0 }),
    );

    model.step(input({ aimX: model.player.x + 100, aimY: model.player.y }));

    expect(model.projectiles.map((projectile) => projectile.id).sort((left, right) => left - right)).toEqual([2, 3, 4, 5]);
  });

  it("replays backdoor shield clears deterministically after rollback", async () => {
    const model = await createBattleModel("reimu", "marisa", ["backdoor"]);
    model.player.facing = 0;
    const shield = model.toOutputState().shields[0]!;
    model.projectiles.push(testProjectile({ id: 1, owner: "target", x: shield.x, y: shield.y }));
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
});

describe("BattleModel character bombs", () => {
  it("reimu bomb clears nearby projectiles and leaves distant projectiles deterministic", async () => {
    const model = await createBattleModel("reimu", "marisa");
    model.projectiles.push(
      testProjectile({ id: 100, owner: "target", x: model.player.x + 8, y: model.player.y }),
      testProjectile({ id: 101, owner: "target", x: model.player.x + 200, y: model.player.y, vx: 1 }),
    );

    model.step(input({ bombPressed: true }));

    expect(model.projectiles.some((projectile) => projectile.id === 100)).toBe(false);
    expect(model.projectiles.find((projectile) => projectile.id === 101)?.x).toBe(model.player.x + 201);
    expect(model.effects.some((effect) => effect.kind === "ring")).toBe(true);
  });

  it("marisa bomb does not pause an existing projectile while scheduling master spark", async () => {
    const model = await createBattleModel("marisa", "reimu");
    model.projectiles.push(testProjectile({
      id: 1,
      owner: "target",
      x: model.player.x + 200,
      y: model.player.y,
      vx: 1,
      pausedUntil: 0,
    }));

    model.step(input({ bombPressed: true }));

    const existing = model.projectiles.find((projectile) => projectile.id === 1);
    expect(existing?.pausedUntil).toBe(0);
    expect(existing?.x).toBe(model.player.x + 201);

    const masterSpark = model.projectiles.find((projectile) => projectile.kind === "spark" && projectile.owner === "player");
    expect(masterSpark?.visibleFrom).toBe(model.frame + 60);
    expect(masterSpark?.pausedUntil).toBe(model.frame + 60);
  });

  it("sakuya bomb clears nearby projectiles and pauses remaining projectiles deterministically", async () => {
    const model = await createBattleModel("sakuya", "reimu");
    model.projectiles.push(
      testProjectile({ id: 100, owner: "target", x: model.player.x + 8, y: model.player.y }),
      testProjectile({ id: 101, owner: "target", x: model.player.x + 200, y: model.player.y, vx: 1 }),
    );

    model.step(input({ bombPressed: true }));

    const distant = model.projectiles.find((projectile) => projectile.id === 101);
    expect(model.projectiles.some((projectile) => projectile.id === 100)).toBe(false);
    expect(distant?.x).toBe(model.player.x + 200);
    expect(distant?.pausedUntil).toBe(model.frame + 60);
    expect(model.effects.some((effect) => effect.kind === "ring")).toBe(true);
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
      owner: "player",
      x: model.player.x,
      y: model.player.y,
      width: 120,
      height: 120,
    });

    const hits = physics.computeCollisions([projectile], model.player, model.target);

    expect(hits).toEqual([{ projectileId: 1, victimKey: "target" }]);
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

function testProjectile(overrides: Partial<BattleModel["projectiles"][number]> & { readonly id: number; readonly owner: "player" | "target" }) {
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
    widthGrowthPerTick: 0,
    maxWidth: undefined,
    damage: 1,
    pierce: false,
    angle: 0,
    ...overrides,
  };
}

function hitPlayer(model: BattleModel): void {
  const hit = model as unknown as {
    onProjectileHit(ctx: { readonly owner: "player" | "target"; readonly victim: BattleModel["player"]; readonly damage: number }): boolean;
  };
  hit.onProjectileHit({ owner: "target", victim: model.player, damage: 1 });
}
