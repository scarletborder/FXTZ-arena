import { describe, expect, it } from "vitest";
import { bulletSpeedRankToPixelsPerTick } from "@repo/types";
import {
  DOLL_BULLET_SIZE,
  DOLL_BULLET_TEXTURE,
  DOLL_FAMILIAR_KIND,
  DOLL_HEALTH,
  DOLL_PHYSICAL_DAMAGE,
  DOLL_RETURN_DISTANCE,
  DOLL_VOLLEY_INTERVAL_TICKS,
} from "@repo/content";

import { BattleModel } from "..";
import { initializeBattleModel, input } from "./helpers";

describe("BattleModel Doll card", () => {
  it("summons an infinite-use active familiar and replaces the owner's previous doll", async () => {
    const model = await createDollModel();

    model.step(input({ activeCardPressed: true, aimX: 700, aimY: 260 }));

    const first = dollFamiliars(model)[0];
    expect(first).toBeDefined();
    expect(first?.state.mobKind).toBe("familiar");
    expect(first?.state.MaxHealth).toBe(DOLL_HEALTH);
    expect(first?.state.CurrentHealth).toBe(DOLL_HEALTH);
    expect(first?.state.physicalAttack).toBe(true);
    expect(first?.state.physicalAttackDamage).toBe(DOLL_PHYSICAL_DAMAGE);
    expect(model.player.activeCardUses).toBe(999);

    while (model.player.activeCardCooldownUntil > 0) {
      model.step(input());
    }
    model.step(input({ activeCardPressed: true, aimX: 760, aimY: 300 }));

    const dolls = dollFamiliars(model);
    expect(dolls).toHaveLength(1);
    expect(dolls[0]?.id).not.toBe(first?.id);
    expect(model.player.activeCardUses).toBe(999);
  });

  it("launches to the crosshair, stops there, then returns after reload", async () => {
    const model = await createDollModel();
    const aim = { x: model.player.x + 80, y: model.player.y + 40 };

    model.step(input({ activeCardPressed: true, aimX: aim.x, aimY: aim.y }));
    const doll = dollFamiliars(model)[0] as DollTestMob;

    for (let tick = 0; tick < 30; tick += 1) {
      model.step(input());
    }

    expect(distance(doll.state, aim)).toBeLessThan(0.001);
    expect(doll.state.phase).toBe("idle");

    model.player.ammo = 0;
    model.step(input({ reloadPressed: true }));
    const distanceAfterReload = distance(doll.state, model.player);
    expect(doll.state.phase).toBe("return");

    model.step(input());
    expect(distance(doll.state, model.player)).toBeLessThan(
      distanceAfterReload,
    );

    for (let tick = 0; tick < 120; tick += 1) {
      model.step(input());
      if (distance(doll.state, model.player) <= DOLL_RETURN_DISTANCE) {
        break;
      }
    }

    expect(distance(doll.state, model.player)).toBeLessThanOrEqual(
      DOLL_RETURN_DISTANCE,
    );
    model.step(input());
    expect(Math.hypot(doll.state.vx, doll.state.vy)).toBe(0);
  });

  it("starts listening for reload only after stopping at the crosshair", async () => {
    const model = await createDollModel();
    const aim = { x: model.player.x + 420, y: model.player.y };

    model.step(input({ activeCardPressed: true, aimX: aim.x, aimY: aim.y }));
    const doll = dollFamiliars(model)[0] as DollTestMob;

    model.player.ammo = 0;
    model.step(input({ reloadPressed: true }));
    expect(doll.state.phase).toBe("launch");

    for (let tick = 0; tick < 120; tick += 1) {
      model.step(input());
      if (doll.state.phase === "idle") {
        break;
      }
    }

    expect(doll.state.phase).toBe("idle");
    expect(distance(doll.state, aim)).toBeLessThan(0.001);
  });

  it("fires four low-speed 36px bullets every 1.2s while returning", async () => {
    const model = await createDollModel();
    model.step(
      input({
        activeCardPressed: true,
        aimX: model.player.x + 500,
        aimY: model.player.y,
      }),
    );
    const doll = dollFamiliars(model)[0] as DollTestMob;

    for (let tick = 0; tick < 120; tick += 1) {
      model.step(input());
      if (doll.state.phase === "idle") {
        break;
      }
    }
    expect(doll.state.phase).toBe("idle");

    model.player.ammo = 0;
    model.step(input({ reloadPressed: true }));

    for (let tick = 0; tick < DOLL_VOLLEY_INTERVAL_TICKS; tick += 1) {
      model.step(input());
    }

    const bullets = dollBullets(model);
    expect(bullets).toHaveLength(4);
    expect(
      bullets.every(
        (bullet) =>
          Math.abs(
            Math.hypot(bullet.vx, bullet.vy) -
              bulletSpeedRankToPixelsPerTick("low"),
          ) < 0.001,
      ),
    ).toBe(true);
    expect(bullets.every((bullet) => bullet.width === DOLL_BULLET_SIZE)).toBe(
      true,
    );
    expect(bullets.every((bullet) => bullet.height === DOLL_BULLET_SIZE)).toBe(
      true,
    );
    expect(
      bullets
        .map((bullet) => normalizeAngle(bullet.angle))
        .sort((left, right) => left - right),
    ).toEqual(
      [0, Math.PI / 2, Math.PI, (Math.PI * 3) / 2]
        .map(normalizeAngle)
        .sort((left, right) => left - right),
    );
  });
});

type DollTestModel = Awaited<ReturnType<typeof createDollModel>>;
type DollTestMob = DollTestModel["neutralMobManager"]["mobs"][number] & {
  readonly state: {
    readonly x: number;
    readonly y: number;
    readonly phase: "launch" | "idle" | "return";
    readonly vx: number;
    readonly vy: number;
  };
};

function createDollModel(): Promise<BattleModel> {
  return initializeBattleModel(
    new BattleModel(
      {
        player: {
          primaryCharacterId: "reimu",
          alternateCharacterId: "marisa",
          cardIds: ["doll"],
          activeCardId: "doll",
        },
        target: {
          primaryCharacterId: "reimu",
          alternateCharacterId: "marisa",
        },
      },
      { neutralMobSpawner: null },
    ),
  );
}

function dollFamiliars(model: DollTestModel) {
  return model.neutralMobManager.mobs.filter(
    (mob) => mob.state.kind === DOLL_FAMILIAR_KIND,
  );
}

function dollBullets(model: DollTestModel) {
  return model.projectiles.filter(
    (projectile) => projectile.textureKey === DOLL_BULLET_TEXTURE,
  );
}

function distance(
  left: { readonly x: number; readonly y: number },
  right: { readonly x: number; readonly y: number },
): number {
  return Math.hypot(left.x - right.x, left.y - right.y);
}

function normalizeAngle(angle: number): number {
  return Math.round(angle * 1_000_000) / 1_000_000;
}
