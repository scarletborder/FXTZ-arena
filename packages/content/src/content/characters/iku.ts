import { bulletSpeedRankToPixelsPerTick, FamiliarMob } from "@repo/types";
import { fp } from "@shaisrc/fixed-point";

import type { NeutralMobActionContext } from "@repo/types";
import type { CharacterDefinition, CharacterGalleryAssets } from "./types";

import type { FighterKey, FighterState } from "../battle-types";
import {
  BattleCharacter,
  DEFAULT_POINT_COLLECT_RADIUS,
  hitCircleUnits,
  secondsToTicks,
  type BattleBulletSpawnParams,
  type BattleLaserSpawnParams,
  type CharacterActionContext,
  type PointPowerTier,
} from "./base";
import {
  createDefaultFamiliarState,
  syncDefaultFamiliarMotion,
  type DefaultFamiliarState,
} from "./default-familiar";
import { registerFamiliarSnapshotFactory } from "./familiar-snapshot";
import { Vanilla } from "../decorators";

export const IKU_COST = 4;
export const IKU_AMMO_CAPACITY = 3;
export const IKU_RELOAD_TICKS_PER_AMMO = secondsToTicks(0.5);
export const IKU_NORMAL_FAMILIAR_SIZE = 36;
export const IKU_NORMAL_FAMILIAR_HEALTH = 50;
export const IKU_NORMAL_FAMILIAR_LIFETIME_TICKS = secondsToTicks(1.2);
export const IKU_NORMAL_FAMILIAR_PHYSICAL_DAMAGE = 2;
export const IKU_LIGHTNING_TEXTURE = "bullet_type_30_offset_3";
export const IKU_LIGHTNING_SIZE = 16;
export const IKU_NORMAL_DEATH_DAMAGE_BY_TIER: Record<PointPowerTier, number> = {
  1: 40,
  2: 40,
  3: 30,
  4: 30,
};
export const IKU_WINGMAN_DAMAGE_BY_TIER: Record<PointPowerTier, number> = {
  1: 0,
  2: 25,
  3: 25,
  4: 20,
};
export const IKU_BOMB_FAMILIAR_COUNT = 9;
export const IKU_BOMB_FAMILIAR_HEALTH = 120;
export const IKU_BOMB_FAMILIAR_LIFETIME_TICKS = secondsToTicks(6.5);
export const IKU_BOMB_TURN_INTERVAL_TICKS = secondsToTicks(1.5);
export const IKU_BOMB_DAMAGE = 30;

const FULL_CIRCLE = Math.PI * 2;
const NORMAL_FAMILIAR_KIND = "iku_normal_familiar";
const BOMB_FAMILIAR_KIND = "iku_bomb_familiar";
const NORMAL_FAMILIAR_RADIUS = IKU_NORMAL_FAMILIAR_SIZE / 2;
const BOMB_FAMILIAR_RADIUS = IKU_NORMAL_FAMILIAR_SIZE / 2;

export class IkuBattleCharacter extends BattleCharacter {
  readonly id = "iku" as CharacterDefinition["id"];
  readonly name = "content.characters.iku.name";
  readonly cost = IKU_COST;
  readonly roleClass = "assault" as CharacterDefinition["roleClass"];
  readonly moveSpeed = "medium" as CharacterDefinition["moveSpeed"];
  readonly fireRate = "medium" as CharacterDefinition["fireRate"];
  readonly ammoCapacity = IKU_AMMO_CAPACITY;
  readonly reloadTicksPerAmmo = IKU_RELOAD_TICKS_PER_AMMO;
  readonly reloadStartPolicy =
    "reset_to_zero" as CharacterDefinition["reloadStartPolicy"];
  readonly reloadCommitPolicy =
    "commit_on_finish" as CharacterDefinition["reloadCommitPolicy"];
  readonly bulletSpeed = "medium" as CharacterDefinition["bulletSpeed"];
  readonly description = "content.characters.iku.description";
  readonly gallery: CharacterGalleryAssets = {
    portraitAsset: "assets/characters/iku/portrait.png",
    attackPreviewAsset: "assets/characters/iku/preview.png",
    combatAsset: "assets/characters/iku/combat.png",
  };
  readonly normalAttackId = "iku_familiar_lightning";
  readonly bombId = "iku_orbiting_lightning_familiars";
  readonly pointCollectRadius = DEFAULT_POINT_COLLECT_RADIUS;

  shoot(
    ctx: CharacterActionContext,
    fighter: FighterState,
    aimX: number,
    aimY: number,
  ): void {
    const angle = this.aimAngle(fighter, aimX, aimY);
    const tier = this.pointPowerTier(fighter);
    this.spawnNormalFamiliar(ctx, fighter, angle, tier);
    this.spawnWingmanShots(ctx, fighter, angle, tier);
  }

  useBomb(ctx: CharacterActionContext, fighter: FighterState): void {
    this.startBomb(ctx, fighter, secondsToTicks(1));
    if (!ctx.spawnMob || !ctx.allocateMobId || fighter.key === "Neutral") {
      this.spawnBombFallback(ctx, fighter);
      return;
    }

    for (let index = 0; index < IKU_BOMB_FAMILIAR_COUNT; index += 1) {
      const angle = (FULL_CIRCLE * index) / IKU_BOMB_FAMILIAR_COUNT;
      ctx.spawnMob(
        new IkuBombFamiliar(
          ctx.allocateMobId(),
          playerFighterKey(fighter.key),
          fighter.x,
          fighter.y,
          angle,
        ),
      );
    }
  }

  onHit(): void {
    // Iku has no hit-time modifier by default.
  }

  private spawnNormalFamiliar(
    ctx: CharacterActionContext,
    fighter: FighterState,
    angle: number,
    tier: PointPowerTier,
  ): void {
    if (!ctx.spawnMob || !ctx.allocateMobId || fighter.key === "Neutral") {
      this.spawnLightningBurst(
        ctx,
        fighter.key,
        fighter.x,
        fighter.y,
        angle,
        tier,
      );
      return;
    }
    const velocity = velocityFromAngle(angle, "medium");
    ctx.spawnMob(
      new IkuNormalFamiliar(
        ctx.allocateMobId(),
        playerFighterKey(fighter.key),
        fighter.x,
        fighter.y,
        velocity.vx,
        velocity.vy,
        tier,
      ),
    );
  }

  private spawnWingmanShots(
    ctx: CharacterActionContext,
    fighter: FighterState,
    angle: number,
    tier: PointPowerTier,
  ): void {
    if (tier < 2) {
      return;
    }

    const sideOffsets =
      tier >= 4
        ? [
          -hitCircleUnits(16),
          -hitCircleUnits(8),
          hitCircleUnits(8),
          hitCircleUnits(16),
        ]
        : [-hitCircleUnits(8), hitCircleUnits(8)];
    for (const side of sideOffsets) {
      const position = this.offsetPosition(
        fighter.x,
        fighter.y,
        angle,
        -hitCircleUnits(16),
        side,
      );
      spawnLightning(ctx, {
        owner: fighter.key,
        x: position.x,
        y: position.y,
        angle,
        speedRank: "high",
        damage: IKU_WINGMAN_DAMAGE_BY_TIER[tier],
      });
    }
  }

  private spawnLightningBurst(
    ctx: Pick<CharacterActionContext, "spawnBullet" | "frame">,
    owner: FighterKey,
    x: number,
    y: number,
    angle: number,
    tier: PointPowerTier,
  ): void {
    const offsets =
      tier >= 3
        ? [45, 135, 225, 315].map(degreesToRadians)
        : [-30, 30].map(degreesToRadians);
    for (const offset of offsets) {
      spawnLightning(ctx, {
        owner,
        x,
        y,
        angle: angle + offset,
        speedRank: "high",
        damage: IKU_NORMAL_DEATH_DAMAGE_BY_TIER[tier],
      });
    }
  }

  private spawnBombFallback(
    ctx: CharacterActionContext,
    fighter: FighterState,
  ): void {
    const volleyCount = Math.floor(
      IKU_BOMB_FAMILIAR_LIFETIME_TICKS / IKU_BOMB_TURN_INTERVAL_TICKS,
    );
    for (let familiar = 0; familiar < IKU_BOMB_FAMILIAR_COUNT; familiar += 1) {
      const baseAngle = (FULL_CIRCLE * familiar) / IKU_BOMB_FAMILIAR_COUNT;
      for (let volley = 0; volley < volleyCount; volley += 1) {
        for (let index = 0; index < 6; index += 1) {
          spawnLightning(ctx, {
            owner: fighter.key,
            x: fighter.x,
            y: fighter.y,
            angle: baseAngle + Math.PI / 2 + (FULL_CIRCLE * index) / 6,
            speedRank: "medium",
            damage: IKU_BOMB_DAMAGE,
            frame: ctx.frame + IKU_BOMB_TURN_INTERVAL_TICKS * (volley + 1),
          });
        }
      }
    }
  }
}

Vanilla.registerCharacter("iku")(IkuBattleCharacter);

interface IkuNormalFamiliarState
  extends DefaultFamiliarState<typeof NORMAL_FAMILIAR_KIND> {
  readonly sourceCharacterId: "iku";
  tier: PointPowerTier;
  burstPending: boolean;
}

class IkuNormalFamiliar extends FamiliarMob<
  IkuNormalFamiliarState,
  BattleBulletSpawnParams,
  BattleLaserSpawnParams
> {
  readonly state: IkuNormalFamiliarState;

  constructor(
    id: number,
    owner: PlayerFighterKey,
    x: number,
    y: number,
    vx: number,
    vy: number,
    tier: PointPowerTier,
  ) {
    super();
    this.state = {
      ...createDefaultFamiliarState({
        id,
        key: owner,
        kind: NORMAL_FAMILIAR_KIND,
        x,
        y,
        health: IKU_NORMAL_FAMILIAR_HEALTH,
        radius: NORMAL_FAMILIAR_RADIUS,
        vx,
        vy,
        physicalAttack: true,
        physicalAttackDamage: IKU_NORMAL_FAMILIAR_PHYSICAL_DAMAGE,
      }),
      sourceCharacterId: "iku",
      tier,
      burstPending: false,
    };
    syncDefaultFamiliarMotion(this.state);
  }

  move(): void {
    this.state.x += this.state.vx;
    this.state.y += this.state.vy;
    syncDefaultFamiliarMotion(this.state);
  }

  fire(): void { }

  switchForm(): void {
    syncDefaultFamiliarMotion(this.state);
  }

  die(
    ctx: NeutralMobActionContext<
      BattleBulletSpawnParams,
      BattleLaserSpawnParams
    >,
  ): void {
    if (
      this.state.CurrentHealth > 0 &&
      this.state.ageTicks < IKU_NORMAL_FAMILIAR_LIFETIME_TICKS &&
      !this.state.burstPending
    ) {
      return;
    }
    this.spawnDeathBurst(ctx);
    this.state.active = false;
  }

  onProjectileHit(damage: number): "accepted" | "ignored" {
    if (!this.state.active || damage <= 0 || this.state.burstPending) {
      return "ignored";
    }
    this.state.damageTaken += damage;
    this.state.CurrentHealth = Math.max(0, this.state.CurrentHealth - damage);
    if (this.state.CurrentHealth <= 0) {
      this.state.burstPending = true;
    }
    return "accepted";
  }

  onDeath(): void { }

  private spawnDeathBurst(
    ctx: NeutralMobActionContext<
      BattleBulletSpawnParams,
      BattleLaserSpawnParams
    >,
  ): void {
    const angle = Math.atan2(this.state.vy, this.state.vx);
    const offsets =
      this.state.tier >= 3
        ? [45, 135, 225, 315].map(degreesToRadians)
        : [-30, 30].map(degreesToRadians);
    for (const offset of offsets) {
      spawnLightning(ctx, {
        owner: this.state.key,
        x: this.state.x,
        y: this.state.y,
        angle: angle + offset,
        speedRank: "high",
        damage: IKU_NORMAL_DEATH_DAMAGE_BY_TIER[this.state.tier],
      });
    }
  }
}

interface IkuBombFamiliarState
  extends DefaultFamiliarState<typeof BOMB_FAMILIAR_KIND> {
  readonly sourceCharacterId: "iku";
}

class IkuBombFamiliar extends FamiliarMob<
  IkuBombFamiliarState,
  BattleBulletSpawnParams,
  BattleLaserSpawnParams
> {
  readonly state: IkuBombFamiliarState;

  constructor(
    id: number,
    owner: PlayerFighterKey,
    x: number,
    y: number,
    angle: number,
  ) {
    const velocity = velocityFromAngle(angle, "low");
    super();
    this.state = {
      ...createDefaultFamiliarState({
        id,
        key: owner,
        kind: BOMB_FAMILIAR_KIND,
        x,
        y,
        health: IKU_BOMB_FAMILIAR_HEALTH,
        radius: BOMB_FAMILIAR_RADIUS,
        vx: velocity.vx,
        vy: velocity.vy,
      }),
      sourceCharacterId: "iku",
    };
    syncDefaultFamiliarMotion(this.state);
  }

  move(): void {
    this.state.x += this.state.vx;
    this.state.y += this.state.vy;
    syncDefaultFamiliarMotion(this.state);
  }

  fire(
    ctx: NeutralMobActionContext<
      BattleBulletSpawnParams,
      BattleLaserSpawnParams
    >,
  ): void {
    if (this.state.ageTicks % IKU_BOMB_TURN_INTERVAL_TICKS !== 0) {
      return;
    }
    const nextVx = -this.state.vy;
    const nextVy = this.state.vx;
    this.state.vx = nextVx;
    this.state.vy = nextVy;
    syncDefaultFamiliarMotion(this.state);
    for (let index = 0; index < 6; index += 1) {
      spawnLightning(ctx, {
        owner: this.state.key,
        x: this.state.x,
        y: this.state.y,
        angle: (FULL_CIRCLE * index) / 6,
        speedRank: "medium",
        damage: IKU_BOMB_DAMAGE,
      });
    }
  }

  switchForm(): void {
    syncDefaultFamiliarMotion(this.state);
  }

  die(): void {
    if (
      this.state.CurrentHealth <= 0 ||
      this.state.ageTicks >= IKU_BOMB_FAMILIAR_LIFETIME_TICKS
    ) {
      this.state.active = false;
    }
  }

  onProjectileHit(damage: number): "accepted" | "ignored" {
    if (!this.state.active || damage <= 0) {
      return "ignored";
    }
    this.state.damageTaken += damage;
    this.state.CurrentHealth = Math.max(0, this.state.CurrentHealth - damage);
    if (this.state.CurrentHealth <= 0) {
      this.state.active = false;
    }
    return "accepted";
  }

  onDeath(): void { }
}

registerFamiliarSnapshotFactory((snapshot) => {
  if (snapshot.kind !== NORMAL_FAMILIAR_KIND) {
    return undefined;
  }
  const state = snapshot as IkuNormalFamiliarState;
  const mob = new IkuNormalFamiliar(
    state.id,
    playerFighterKey(state.key),
    state.x,
    state.y,
    state.vx,
    state.vy,
    state.tier,
  );
  mob.restore(state);
  return mob;
});

registerFamiliarSnapshotFactory((snapshot) => {
  if (snapshot.kind !== BOMB_FAMILIAR_KIND) {
    return undefined;
  }
  const state = snapshot as IkuBombFamiliarState;
  const mob = new IkuBombFamiliar(
    state.id,
    playerFighterKey(state.key),
    state.x,
    state.y,
    state.angle,
  );
  mob.restore(state);
  return mob;
});

interface LightningSpawnParams {
  readonly owner: FighterKey;
  readonly x: number;
  readonly y: number;
  readonly angle: number;
  readonly speedRank: "medium" | "high";
  readonly damage: number;
  readonly frame?: number;
}

function spawnLightning(
  ctx: Pick<CharacterActionContext, "spawnBullet" | "frame">,
  params: LightningSpawnParams,
): void {
  ctx.spawnBullet({
    owner: params.owner,
    sourceCharacterId: "iku",
    textureKey: IKU_LIGHTNING_TEXTURE,
    kind: "orb",
    x: params.x,
    y: params.y,
    angle: params.angle,
    speedRank: params.speedRank,
    width: IKU_LIGHTNING_SIZE,
    height: IKU_LIGHTNING_SIZE,
    homingTicks: 0,
    damage: params.damage,
    spawnOffset: 0,
    frame: params.frame ?? ctx.frame,
    couldClear: true,
  });
}

function velocityFromAngle(
  angle: number,
  speedRank: "low" | "medium" | "high",
): { readonly vx: number; readonly vy: number } {
  const speed = bulletSpeedRankToPixelsPerTick(speedRank);
  const fpAngle = fp.fromFloat(angle);
  const fpSpeed = fp.fromFloat(speed);
  return {
    vx: fp.toFloat(fp.mul(fp.cos(fpAngle), fpSpeed)),
    vy: fp.toFloat(fp.mul(fp.sin(fpAngle), fpSpeed)),
  };
}

type PlayerFighterKey = Exclude<FighterKey, "Neutral">;

function playerFighterKey(key: FighterKey): PlayerFighterKey {
  if (key === "Neutral") {
    throw new Error("Iku familiar must belong to a player");
  }
  return key;
}

function degreesToRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}
