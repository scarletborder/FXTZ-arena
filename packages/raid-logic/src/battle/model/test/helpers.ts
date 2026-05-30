import type { BattleInputState, NeutralMobState } from "@repo/types";
import { NeutralMob } from "@repo/types";
import {
  NeutralMobSpawner,
  type BattleNeutralMob,
  type NeutralMobSpawnerContext,
  type NeutralMobSpawnerState,
} from "@repo/content";
import type { BattleLoadouts } from "../../loadout";
import { BattleModel } from "..";
import { BattlePhysics } from "../physics-adapter";
import type {
  BulletProjectileParams,
  LaserProjectileParams,
} from "../projectile";

export function createInputs(frames: number): BattleInputState[] {
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

export function input(
  overrides: Partial<BattleInputState> = {},
): BattleInputState {
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

export function createBattleModel(
  primaryCharacterId: BattleLoadouts["player"]["primaryCharacterId"],
  alternateCharacterId: BattleLoadouts["player"]["alternateCharacterId"],
  cardIds?: BattleLoadouts["player"]["cardIds"],
  activeCardId?: BattleLoadouts["player"]["activeCardId"],
): Promise<BattleModel>;
export function createBattleModel(): Promise<BattleModel>;
export async function createBattleModel(
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
  return initializeBattleModel(model);
}

export async function createBattleModelWithSpawner(
  neutralMobSpawner: NeutralMobSpawner,
): Promise<BattleModel> {
  return initializeBattleModel(
    new BattleModel(
      {
        player: {
          primaryCharacterId: "reimu",
          alternateCharacterId: "marisa",
        },
        target: {
          primaryCharacterId: "reimu",
          alternateCharacterId: "marisa",
        },
      },
      { neutralMobSpawner },
    ),
  );
}

export async function initializeBattleModel(
  model: BattleModel,
): Promise<BattleModel> {
  const physics = new BattlePhysics();
  await physics.init();
  model.setPhysics(physics);
  return model;
}

export async function shootOnceAtPoint(
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

export function testProjectile(
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
    retargetSpeed: undefined,
    widthGrowthPerTick: 0,
    maxWidth: undefined,
    damage: 1,
    angle: 0,
    couldClear: true,
    clearsProjectiles: false,
    piercesTargets: false,
    polarOriginX: undefined,
    polarOriginY: undefined,
    polarRadius: undefined,
    polarAngle: undefined,
    polarRadialSpeed: undefined,
    polarAngularSpeed: undefined,
    ...overrides,
  };
}

export class TestNeutralMob extends NeutralMob<
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

export class StaticRectNeutralMob extends NeutralMob<
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

export interface HiddenCounterSpawnerState extends NeutralMobSpawnerState {
  readonly spawnerId: "hidden-counter";
  readonly nextSpawnFrame: number;
}

export class HiddenCounterSpawner extends NeutralMobSpawner<HiddenCounterSpawnerState> {
  readonly id = "hidden-counter";
  private nextSpawnFrame = 3;

  step(ctx: NeutralMobSpawnerContext): void {
    if (ctx.frame !== this.nextSpawnFrame) {
      return;
    }
    ctx.spawnMob(new TestNeutralMob(ctx.allocateMobId(), 320 + ctx.frame, 240));
    this.nextSpawnFrame += 3;
  }

  snapshot(): HiddenCounterSpawnerState {
    return {
      spawnerId: this.id,
      nextSpawnFrame: this.nextSpawnFrame,
    };
  }

  restore(snapshot: HiddenCounterSpawnerState): void {
    this.nextSpawnFrame = snapshot.nextSpawnFrame;
  }

  reset(): void {
    this.nextSpawnFrame = 3;
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

export function hitPlayer(model: BattleModel): void {
  const hit = model as unknown as {
    onProjectileHit(ctx: {
      readonly owner: "Player1" | "Player2";
      readonly victim: BattleModel["player"];
      readonly damage: number;
    }): boolean;
  };
  hit.onProjectileHit({ owner: "Player2", victim: model.player, damage: 1 });
}

export function hitTarget(model: BattleModel): void {
  const hit = model as unknown as {
    onProjectileHit(ctx: {
      readonly owner: "Player1" | "Player2";
      readonly victim: BattleModel["target"];
      readonly damage: number;
    }): boolean;
  };
  hit.onProjectileHit({ owner: "Player1", victim: model.target, damage: 1 });
}
