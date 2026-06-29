import { BattleModel } from "..";
import { describe, expect, it } from "vitest";
import type { BattleInputState } from "@repo/types";
import { BattlePhysics } from "../physics-adapter";
import { createBattleModel, input, StaticRectNeutralMob } from "./helpers";
import { NeutralMobSpawner } from "@repo/content";
import type {
  BattleNeutralMob,
  NeutralMobSpawnerContext,
  NeutralMobSpawnerState,
} from "@repo/content";
import type { MobState, NeutralMobState } from "@repo/types";

describe("BattleModel Yukari", () => {
  it("exposes Yukari's base character definition and Marisa-style reload policy", async () => {
    const model = await createBattleModel("yukari", "reimu");

    expect(model.player.activeCharacter.id).toBe("yukari");
    expect(model.player.activeCharacter.cost).toBe(5);
    expect(model.player.activeCharacter.roleClass).toBe("sniper");
    expect(model.player.activeCharacter.moveSpeed).toBe("low");
    expect(model.player.ammoCapacity).toBe(2);
    expect(model.player.activeCharacter.reloadTicksPerAmmo).toBe(60);
    expect(model.player.activeCharacter.reloadStartPolicy).toBe(
      "reset_to_zero",
    );
    expect(model.player.activeCharacter.reloadCommitPolicy).toBe(
      "commit_on_finish",
    );
  });

  it("spawns Ran while Yukari is active, stops moving after switching away but stays alive", async () => {
    const model = await createBattleModel("reimu", "yukari");

    model.step(step({ alternateHeld: true, aimX: 500, aimY: 280 }));
    let ran = ranCompanion(model);
    expect(ran?.x).toBe(model.player.x);
    expect(ran?.y).toBe(model.player.y);
    expect(ran?.followAimOwner).toBe("Player1");

    model.step(step({ alternateHeld: true, aimX: 900, aimY: 280 }));
    ran = ranCompanion(model);
    expect(ran?.x).toBeGreaterThan(model.player.x);
    expect(ran?.followAimOwner).toBe("Player1");

    // Switching away: Ran stops moving but stays alive for collision + shooting.
    model.step(step({ alternateHeld: false, aimX: 100, aimY: 280 }));
    ran = ranCompanion(model);
    expect(ran?.followAimOwner).toBe("Player1");
    expect(ran?.followWhileActiveCharacterId).toBe("yukari");
    expect(ran?.vx).toBe(0);
    expect(ran?.vy).toBe(0);
  });

  it("fires Ran assist bullets when Yukari is not the active character", async () => {
    const model = await createBattleModel("reimu", "yukari");

    // First make Yukari active so Ran spawns.
    model.step(step({ alternateHeld: true, aimX: 900, aimY: 280 }));
    expect(ranCompanion(model)).toBeDefined();

    // Switch to Reimu (primary). Ran should stay but not move.
    model.step(step({ alternateHeld: false, aimX: 900, aimY: 280 }));
    const ranBefore = ranCompanion(model)!;
    expect(ranBefore.followAimOwner).toBe("Player1");
    expect(ranBefore.vx).toBe(0);
    expect(ranBefore.vy).toBe(0);

    // Set some point power so Ran bullets have non-zero damage for filtering.
    model.pointManager.setPointCount(model.player, 100);

    // Fire while Reimu is active — Ran should also fire bullets.
    model.step(step({ shootPressed: true, aimX: 900, aimY: 280 }));
    const ranBullets = model.projectiles.filter(
      (projectile) =>
        projectile.textureKey === "bullet_type_5_offset_13" &&
        projectile.sourceCharacterId === "yukari",
    );
    expect(ranBullets.length).toBeGreaterThanOrEqual(1);
    // Ran bullets should come from Ran's position, not fighter's.
    expect(ranBullets[0]?.x).toBeCloseTo(ranBefore.x, 0);
    expect(ranBullets[0]?.y).toBeCloseTo(ranBefore.y, 0);
  });

  it("fires Ran bullets from Ran position toward crosshair", async () => {
    const model = await createBattleModel("yukari", "reimu");

    // Let Ran spawn and start following aim.
    model.step(step({ aimX: 900, aimY: 280 }));
    const ran = ranCompanion(model)!;

    // Position Ran away from the fighter.
    ran.x = model.player.x + 50;
    ran.y = model.player.y;
    ran.previousX = ran.x;
    ran.previousY = ran.y;

    // Fire: Ran bullets should be spawned at Ran's position with the
    // direction from Ran toward the crosshair.
    model.step(step({ shootPressed: true, aimX: 900, aimY: 340 }));

    const ranBullets = model.projectiles.filter(
      (p) =>
        p.textureKey === "bullet_type_5_offset_13" &&
        p.sourceCharacterId === "yukari",
    );
    expect(ranBullets.length).toBeGreaterThanOrEqual(1);
    // Ran bullet should originate near Ran's position (not the fighter's at x=180).
    // Allow small fixed-point rounding differences.
    expect(ranBullets[0]?.x).toBeGreaterThan(model.player.x + 20);
    expect(ranBullets[0]?.y).toBeCloseTo(ran.y, -1);
  });

  it("fires Yukari tier shots and Ran assist shots by point tier", async () => {
    const tier1 = await shootYukariAtPoint(0);
    expect(
      tier1.projectiles.filter(
        (projectile) => projectile.textureKey === "bullet_type_5_offset_3",
      ),
    ).toHaveLength(1);
    expect(
      tier1.projectiles.filter(
        (projectile) => projectile.textureKey === "bullet_type_5_offset_13",
      ),
    ).toHaveLength(1);
    expect(
      tier1.projectiles.find(
        (projectile) => projectile.textureKey === "bullet_type_5_offset_3",
      )?.damage,
    ).toBe(90);

    const tier3 = await shootYukariAtPoint(200);
    expect(
      tier3.projectiles.filter(
        (projectile) => projectile.textureKey === "bullet_type_5_offset_3",
      ),
    ).toHaveLength(2);
    expect(
      tier3.projectiles.filter(
        (projectile) => projectile.textureKey === "bullet_type_5_offset_6",
      ),
    ).toHaveLength(2);
    expect(
      tier3.projectiles.filter(
        (projectile) => projectile.textureKey === "bullet_type_5_offset_13",
      ),
    ).toHaveLength(2);
    expect(
      tier3.projectiles
        .filter(
          (projectile) => projectile.textureKey === "bullet_type_5_offset_3",
        )
        .every((projectile) => projectile.damage === 50),
    ).toBe(true);
    expect(
      tier3.projectiles
        .filter(
          (projectile) => projectile.textureKey === "bullet_type_5_offset_6",
        )
        .every((projectile) => projectile.damage === 20),
    ).toBe(true);

    const tier4 = await shootYukariAtPoint(300);
    expect(
      tier4.projectiles.filter(
        (projectile) => projectile.textureKey === "bullet_type_5_offset_3",
      ),
    ).toHaveLength(3);
    expect(
      tier4.projectiles
        .filter(
          (projectile) => projectile.textureKey === "bullet_type_5_offset_3",
        )
        .every((projectile) => projectile.damage === 45),
    ).toBe(true);
  });

  it("spawns a reduced but evenly distributed boundary bomb volley", async () => {
    const model = await createBattleModel("yukari", "reimu");

    model.step(step({ bombPressed: true, aimX: 640, aimY: 300 }));

    const bombBullets = model.projectiles.filter(
      (projectile) =>
        projectile.sourceCharacterId === "yukari" &&
        projectile.damage === 5 &&
        projectile.kind === "orb",
    );

    expect(bombBullets).toHaveLength(24);
    expect(
      bombBullets.every((projectile) => projectile.visibleFrom > model.frame),
    ).toBe(true);
  });

  it("lets Ran deal physical frame damage and enter roll state on neutral collision", async () => {
    const spawner = new OneMobSpawner(190, 280);
    const model = new BattleModel(
      {
        player: { primaryCharacterId: "yukari", alternateCharacterId: "reimu" },
        target: { primaryCharacterId: "reimu", alternateCharacterId: "marisa" },
      },
      { battleMode: "collaborate", neutralMobSpawner: spawner },
    );
    const physics = new BattlePhysics();
    await physics.init();
    model.setPhysics(physics);

    model.step(input({ aimX: 190, aimY: 280 }));
    model.step(input({ aimX: 190, aimY: 280 }));

    const ran = ranCompanion(model);
    expect(ran?.physicalAttack).toBe(true);
    expect(ran?.physicalAttackDamage).toBe(1);
    expect(ran?.rollUntil ?? 0).toBeGreaterThan(model.frame);
    expect(spawner.mob.damageTaken).toBeGreaterThanOrEqual(1);
  });

  it("keeps Ran at immortal-fairy style infinite health when hit", async () => {
    const model = await createBattleModel("yukari", "reimu");

    model.step(step({ aimX: 900, aimY: 280 }));

    const ran = ranCompanionMob(model);
    expect(ran?.onProjectileHit(999)).toBe("accepted");
    expect(ran?.state.active).toBe(true);
    expect(ran?.state.MaxHealth).toBe(Number.MAX_SAFE_INTEGER);
    expect(ran?.state.CurrentHealth).toBe(Number.MAX_SAFE_INTEGER);
    expect(ran?.state.damageTaken).toBe(999);
  });
});

async function shootYukariAtPoint(pointCount: number): Promise<BattleModel> {
  const model = await createBattleModel("yukari", "reimu");
  model.step(input({ aimX: 900, aimY: 400 }));
  model.pointManager.setPointCount(model.player, pointCount);
  // Move Ran well off the fighter→crosshair line so the sniper-alignment
  // check does not trigger — we want to test the normal spread pattern.
  const ran = ranCompanion(model);
  if (ran) {
    ran.x = model.player.x + 50;
    ran.y = model.player.y - 60;
    ran.previousX = ran.x;
    ran.previousY = ran.y;
  }
  model.step(input({ shootPressed: true, aimX: 900, aimY: 400 }));
  return model;
}

function ranCompanion(model: BattleModel) {
  return ranCompanionMob(model)?.state as
    | (MobState & {
        readonly followAimOwner: string;
        readonly followWhileActiveCharacterId: string;
        vx: number;
        vy: number;
        rollUntil?: number;
        physicalAttack?: boolean;
        physicalAttackDamage?: number;
      })
    | undefined;
}

function ranCompanionMob(model: BattleModel) {
  return model.neutralMobManager.mobs.find(
    (mob) => mob.state.kind === "ran_familiar",
  );
}

function step(overrides: Partial<BattleInputState>): BattleInputState {
  return input({ shootPressed: false, bombPressed: false, ...overrides });
}

interface OneMobSpawnerState extends NeutralMobSpawnerState {
  readonly spawnerId: "one-yukari-test-mob";
  readonly spawned: boolean;
}

class OneMobSpawner extends NeutralMobSpawner<OneMobSpawnerState> {
  readonly id = "one-yukari-test-mob";
  readonly mob: StaticRectNeutralMob;
  private spawned = false;

  constructor(x: number, y: number) {
    super();
    this.mob = new StaticRectNeutralMob(1, x, y);
  }

  step(ctx: NeutralMobSpawnerContext): void {
    if (this.spawned) return;
    ctx.spawnMob(this.mob);
    this.spawned = true;
  }

  snapshot(): OneMobSpawnerState {
    return { spawnerId: this.id, spawned: this.spawned };
  }

  restore(snapshot: OneMobSpawnerState): void {
    this.spawned = snapshot.spawned;
  }

  reset(): void {
    this.spawned = false;
    this.mob.damageTaken = 0;
  }

  createMobFromSnapshot(
    snapshot: NeutralMobState,
  ): BattleNeutralMob | undefined {
    return snapshot.kind === "static_rect_mob" ? this.mob : undefined;
  }
}
