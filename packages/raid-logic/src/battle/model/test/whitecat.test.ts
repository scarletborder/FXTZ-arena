import { describe, expect, it } from "vitest";
import {
  WHITECAT_BULLET_TEXTURE,
  WHITECAT_FAMILIAR_KIND,
  WHITECAT_LEAP_DURATION_TICKS,
  WHITECAT_LEAP_INTERVAL_TICKS,
  WHITECAT_NON_SPELL_HEALTH,
  WHITECAT_SNIPE_BULLET_COUNT,
  WHITECAT_SPELL_HEALTH,
  WHITECAT_WHEEL_BULLET_COUNT,
  WHITECAT_WHEEL_INTERVAL_TICKS,
} from "@repo/content";

import { createBattleModel, input, StaticRectNeutralMob } from "./helpers";

describe("BattleModel Whitecat card", () => {
  it("summons a single-use elite-style familiar", async () => {
    const model = await createBattleModel(
      "reimu",
      "marisa",
      ["whitecat"],
      "whitecat",
    );

    model.step(input({ activeCardPressed: true }));

    const familiar = whitecatFamiliars(model)[0];
    expect(familiar).toBeDefined();
    expect(familiar?.state.class).toBe("elite");
    expect(familiar?.state.mobKind).toBe("familiar");
    expect(familiar?.state.textureKey).toBe("default-familiar");
    expect(familiar?.state.form).toBe("normal");
    expect(familiar?.state.hitRadius).toBeGreaterThan(10);
    expect(familiar?.state.spellCard?.phase).toBe("non_spell");
    expect(familiar?.state.MaxHealth).toBe(WHITECAT_NON_SPELL_HEALTH);
    expect(familiar?.state.spellCard?.spellCards).toHaveLength(1);
    expect(model.player.activeCardUses).toBe(0);

    model.step(input({ activeCardPressed: true }));

    expect(whitecatFamiliars(model)).toHaveLength(1);
  });

  it("leaps over 0.5s every 1.8s and fires five medium snipe bullets on landing", async () => {
    const model = await createBattleModel(
      "reimu",
      "marisa",
      ["whitecat"],
      "whitecat",
    );
    model.step(input({ activeCardPressed: true }));
    const familiar = whitecatFamiliars(model)[0]!;
    const start = { x: familiar.state.x, y: familiar.state.y };

    for (let tick = 0; tick < WHITECAT_LEAP_INTERVAL_TICKS; tick += 1) {
      model.step(input());
    }

    const distanceAtLeapStart = Math.hypot(
      familiar.state.x - start.x,
      familiar.state.y - start.y,
    );
    expect(distanceAtLeapStart).toBeGreaterThan(0);
    expect(whitecatBullets(model)).toHaveLength(0);

    for (let tick = 1; tick < WHITECAT_LEAP_DURATION_TICKS; tick += 1) {
      model.step(input());
    }

    expect(
      Math.hypot(familiar.state.x - start.x, familiar.state.y - start.y),
    ).toBeGreaterThan(distanceAtLeapStart);
    const snipeBullets = whitecatBullets(model);
    expect(snipeBullets).toHaveLength(WHITECAT_SNIPE_BULLET_COUNT);
    expect(
      snipeBullets.every(
        (projectile) => projectile.textureKey === WHITECAT_BULLET_TEXTURE,
      ),
    ).toBe(true);
  });

  it("enters spell card at zero non-spell health, chases, and fires a rotating wheel", async () => {
    const model = await createBattleModel(
      "reimu",
      "marisa",
      ["whitecat"],
      "whitecat",
    );
    model.step(input({ activeCardPressed: true }));
    const familiar = whitecatFamiliars(model)[0]!;

    expect(familiar.onProjectileHit(WHITECAT_NON_SPELL_HEALTH)).toBe(
      "accepted",
    );
    expect(familiar.state.spellCard?.phase).toBe("spell_card");
    expect(familiar.state.CurrentHealth).toBe(WHITECAT_SPELL_HEALTH);
    const startDistance = Math.hypot(
      model.target.x - familiar.state.x,
      model.target.y - familiar.state.y,
    );

    for (let tick = 0; tick < WHITECAT_WHEEL_INTERVAL_TICKS; tick += 1) {
      model.step(input());
    }

    const nextDistance = Math.hypot(
      model.target.x - familiar.state.x,
      model.target.y - familiar.state.y,
    );
    expect(nextDistance).toBeLessThan(startDistance);
    expect(whitecatBullets(model)).toHaveLength(WHITECAT_WHEEL_BULLET_COUNT);
  });

  it("locks the enemy nearest to the cursor when using the active card", async () => {
    const model = await createBattleModel(
      "reimu",
      "marisa",
      ["whitecat"],
      "whitecat",
    );
    const decoy = new StaticRectNeutralMob(101, model.player.x + 80, 120);
    const chosen = new StaticRectNeutralMob(102, model.player.x + 120, 520);
    model.neutralMobManager.addNeutralMob(decoy);
    model.neutralMobManager.addNeutralMob(chosen);

    model.step(
      input({
        activeCardPressed: true,
        aimX: chosen.state.x + 4,
        aimY: chosen.state.y,
      }),
    );
    const familiar = whitecatFamiliars(model)[0]! as WhitecatLockedTargetMob;
    expect(familiar.state.lockedTargetMobId).toBe(chosen.id);

    for (
      let tick = 0;
      tick < WHITECAT_LEAP_INTERVAL_TICKS + WHITECAT_LEAP_DURATION_TICKS;
      tick += 1
    ) {
      model.step(input());
    }

    const centerSnipe = whitecatBullets(model)[
      Math.floor(WHITECAT_SNIPE_BULLET_COUNT / 2)
    ]!;
    const chosenAngle = Math.atan2(
      chosen.state.y - familiar.state.y,
      chosen.state.x - familiar.state.x,
    );
    const decoyAngle = Math.atan2(
      decoy.state.y - familiar.state.y,
      decoy.state.x - familiar.state.x,
    );
    expect(angleDistance(centerSnipe.angle, chosenAngle)).toBeLessThan(
      angleDistance(centerSnipe.angle, decoyAngle),
    );

    expect(familiar.onProjectileHit(WHITECAT_NON_SPELL_HEALTH)).toBe(
      "accepted",
    );
    const beforeSpellDistance = distance(familiar.state, chosen.state);
    model.step(input());

    expect(distance(familiar.state, chosen.state)).toBeLessThan(
      beforeSpellDistance,
    );
  });

  it("keeps only one active card in runtime loadouts", async () => {
    const model = await createBattleModel(
      "reimu",
      "marisa",
      ["spirit_strike_card", "whitecat"],
      "whitecat",
    );

    expect(
      model.player.abilityCards.filter((card) => card.kind === "active"),
    ).toHaveLength(1);
    expect(model.player.activeCard?.id).toBe("whitecat");
  });
});

type WhitecatTestModel = Awaited<ReturnType<typeof createBattleModel>>;
type WhitecatLockedTargetMob = WhitecatTestModel["neutralMobManager"]["mobs"][number] & {
  readonly state: {
    readonly x: number;
    readonly y: number;
    readonly lockedTargetMobId?: number;
  };
};

function whitecatFamiliars(model: WhitecatTestModel) {
  return model.neutralMobManager.mobs.filter(
    (mob) => mob.state.kind === WHITECAT_FAMILIAR_KIND,
  );
}

function whitecatBullets(model: WhitecatTestModel) {
  return model.projectiles.filter(
    (projectile) => projectile.textureKey === WHITECAT_BULLET_TEXTURE,
  );
}

function distance(
  left: { readonly x: number; readonly y: number },
  right: { readonly x: number; readonly y: number },
): number {
  return Math.hypot(left.x - right.x, left.y - right.y);
}

function angleDistance(left: number, right: number): number {
  return Math.abs(Math.atan2(Math.sin(left - right), Math.cos(left - right)));
}
