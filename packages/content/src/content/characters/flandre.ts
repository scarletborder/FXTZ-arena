import { bulletSpeedRankToPixelsPerTick, FamiliarMob } from "@repo/types";
import type {
  FamiliarMobState,
  NeutralMobActionContext,
  NeutralMobDeathSource,
} from "@repo/types";
import { t } from "@repo/i18n";
import { fp } from "@shaisrc/fixed-point";

import type { FighterKey, FighterState } from "../battle-types";
import type { BattleHitContext } from "../ability-cards/base";
import { fpAtan2 } from "../fp";
import type { CharacterDefinition, CharacterGalleryAssets } from "./types";
import {
  BattleCharacter,
  DEFAULT_POINT_COLLECT_RADIUS,
  secondsToTicks,
  type BattleBulletSpawnParams,
  type BattleLaserSpawnParams,
  type CharacterActionContext,
  type PointPowerTier,
} from "./base";
import { Vanilla } from "../decorators";

export const FLANDRE_NORMAL_DURATION_TICKS = secondsToTicks(0.8);
export const FLANDRE_NORMAL_THICKNESS = 24;
export const FLANDRE_NORMAL_LENGTH_BY_TIER: Record<PointPowerTier, number> = {
  1: 48,
  2: 56,
  3: 64,
  4: 72,
};
export const FLANDRE_NORMAL_DAMAGE_BY_TIER: Record<PointPowerTier, number> = {
  1: 2,
  2: 3,
  3: 4,
  4: 5,
};
export const FLANDRE_NORMAL_TEXTURE_KEY = "effect_flandre_laevatein";

const BOMB_CLEAR_MULTIPLIER = 24;
const BOMB_CLEAR_DURATION = secondsToTicks(1);
const FAMILIAR_KIND = "flandre_familiar";
const FAMILIAR_HEALTH = Number.MAX_SAFE_INTEGER;
const FAMILIAR_HIT_RADIUS = 16;
const FAMILIAR_DISPLAY_SIZE = 87; // COMBAT_DISPLAY_SIZE=104, 104/1.2≈87
const FAMILIAR_COLLISION_DAMAGE = 1;
const FAMILIAR_SHOT_SIZE = 12;
const FAMILIAR_SHOT_DAMAGE = 3;
const FAMILIAR_SHOT_DELAY = secondsToTicks(1.5);
const FAMILIAR_SHOT_INTERVAL = secondsToTicks(1.5);
const FAMILIAR_SHOT_SPREAD = 0.16;

type PlayerFighterKey = Exclude<FighterKey, "Neutral">;

export class FlandreBattleCharacter extends BattleCharacter {
  readonly id = "flandre" as CharacterDefinition["id"];
  readonly name = t("content.characters.flandre.name");
  readonly cost = 4;
  readonly roleClass = "scout" as CharacterDefinition["roleClass"];
  readonly moveSpeed = "medium" as CharacterDefinition["moveSpeed"];
  readonly fireRate = "low" as CharacterDefinition["fireRate"];
  readonly ammoCapacity = 1;
  readonly reloadTicksPerAmmo = secondsToTicks(1.3);
  readonly reloadStartPolicy =
    "reset_to_zero" as CharacterDefinition["reloadStartPolicy"];
  readonly reloadCommitPolicy =
    "commit_on_finish" as CharacterDefinition["reloadCommitPolicy"];
  readonly bulletSpeed = "medium" as CharacterDefinition["bulletSpeed"];
  readonly description = t("content.characters.flandre.description");
  readonly gallery: CharacterGalleryAssets = {
    portraitAsset: "assets/characters/flandre/portrait.png",
    attackPreviewAsset: "assets/characters/flandre/preview.png",
    combatAsset: "assets/characters/flandre/combat.png",
  };
  readonly normalAttackId = "flandre_laevatein";
  readonly bombId = "flandre_clone_familiars";
  readonly pointCollectRadius = DEFAULT_POINT_COLLECT_RADIUS;

  shoot(
    ctx: CharacterActionContext,
    fighter: FighterState,
    aimX: number,
    aimY: number,
  ): void {
    const tier = this.pointPowerTier(fighter);
    const angle = this.aimAngle(fighter, aimX, aimY);
    const length = FLANDRE_NORMAL_LENGTH_BY_TIER[tier];
    const damage = FLANDRE_NORMAL_DAMAGE_BY_TIER[tier];

    fighter.switchLockedUntil = Math.max(
      fighter.switchLockedUntil,
      FLANDRE_NORMAL_DURATION_TICKS,
    );
    fighter.moveSpeedOverride = "high";
    fighter.moveSpeedOverrideUntil = Math.max(
      fighter.moveSpeedOverrideUntil,
      FLANDRE_NORMAL_DURATION_TICKS,
    );
    fighter.moveSpeedOverrideDelayRemaining = 0;
    fighter.pendingMoveSpeedOverride = undefined;
    fighter.pendingMoveSpeedOverrideDuration = 0;

    ctx.spawnLaser({
      owner: fighter.key,
      sourceCharacterId: "flandre",
      textureKey: FLANDRE_NORMAL_TEXTURE_KEY,
      x: fighter.x,
      y: fighter.y,
      angle,
      speedRank: "low",
      height: FLANDRE_NORMAL_THICKNESS,
      renderHeight: FLANDRE_NORMAL_THICKNESS,
      initialLength: length,
      maxLength: length,
      lengthGrowthPerTick: 0,
      damage,
      expireTicks: FLANDRE_NORMAL_DURATION_TICKS,
      spawnOffset: length / 2,
      pinned: true,
      followOwner: fighter.key,
      followOwnerDistance: length / 2,
      followOwnerAngle: angle,
      couldClear: false,
      piercesTargets: true,
    });
  }

  useBomb(
    ctx: CharacterActionContext,
    fighter: FighterState,
    aimX: number,
    aimY: number,
  ): void {
    this.startBomb(ctx, fighter, secondsToTicks(4));

    const radius = this.clearProjectiles(
      ctx,
      fighter,
      BOMB_CLEAR_MULTIPLIER,
      BOMB_CLEAR_DURATION,
    );
    this.spawnClearRing(ctx, fighter, radius, 0xff5aa8, BOMB_CLEAR_DURATION);

    if (!ctx.spawnMob || !ctx.allocateMobId || fighter.key === "Neutral") {
      return;
    }

    const axisAngle = this.aimAngle(fighter, aimX, aimY);
    for (const angle of [
      axisAngle - Math.PI / 4,
      axisAngle,
      axisAngle + Math.PI / 4,
    ]) {
      ctx.spawnMob(
        new FlandreFamiliar(
          ctx.allocateMobId(),
          playerFighterKey(fighter.key),
          fighter,
          angle,
        ),
      );
    }
  }

  onHit(_ctx: BattleHitContext): void {
    // Flandre has no hit-time modifier by default.
  }
}

interface FlandreFamiliarState extends FamiliarMobState {
  readonly kind: typeof FAMILIAR_KIND;
  readonly characterId: "flandre";
  damageTaken: number;
  vx: number;
  vy: number;
  angle: number;
}

class FlandreFamiliar extends FamiliarMob<
  FlandreFamiliarState,
  BattleBulletSpawnParams,
  BattleLaserSpawnParams
> {
  readonly state: FlandreFamiliarState;

  constructor(
    id: number,
    owner: PlayerFighterKey,
    fighter: FighterState,
    angle: number,
  ) {
    super();
    const speed = bulletSpeedRankToPixelsPerTick("medium");
    this.state = {
      id,
      key: owner,
      mobKind: "familiar",
      kind: FAMILIAR_KIND,
      characterId: "flandre",
      x: fighter.x,
      y: fighter.y,
      previousX: fighter.x,
      previousY: fighter.y,
      hitRadius: FAMILIAR_HIT_RADIUS,
      hitWidth: FAMILIAR_DISPLAY_SIZE,
      hitHeight: FAMILIAR_DISPLAY_SIZE,
      waveId: 0,
      movementVariant: "straight",
      form: "default",
      MaxHealth: FAMILIAR_HEALTH,
      CurrentHealth: FAMILIAR_HEALTH,
      damageTaken: 0,
      active: true,
      ageTicks: 0,
      physicalAttack: true,
      physicalAttackDamage: FAMILIAR_COLLISION_DAMAGE,
      sfxFlags: 0,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      angle,
    };
  }

  move(): void {
    this.state.x += this.state.vx;
    this.state.y += this.state.vy;
  }

  fire(
    ctx: NeutralMobActionContext<BattleBulletSpawnParams, BattleLaserSpawnParams>,
  ): void {
    if (this.state.ageTicks < FAMILIAR_SHOT_DELAY) {
      return;
    }
    if (
      (this.state.ageTicks - FAMILIAR_SHOT_DELAY) %
      FAMILIAR_SHOT_INTERVAL !==
      0
    ) {
      return;
    }

    const target = this.state.key === "Player1" ? ctx.target : ctx.player;
    const angle = fpAtan2(
      fp.fromFloat(target.y - this.state.y),
      fp.fromFloat(target.x - this.state.x),
    );
    for (const offset of [-FAMILIAR_SHOT_SPREAD, 0, FAMILIAR_SHOT_SPREAD]) {
      ctx.spawnBullet({
        owner: this.state.key,
        sourceCharacterId: "flandre",
        textureKey: "bullet_type_9_offset_2",
        kind: "orb",
        x: this.state.x,
        y: this.state.y,
        angle: angle + offset,
        speedRank: "medium",
        width: FAMILIAR_SHOT_SIZE,
        height: FAMILIAR_SHOT_SIZE,
        homingTicks: 0,
        damage: FAMILIAR_SHOT_DAMAGE,
        spawnOffset: 0,
        couldClear: true,
      });
    }
  }

  switchForm(): void { }

  die(): void {
    this.state.active = true;
    this.state.CurrentHealth = FAMILIAR_HEALTH;
  }

  onProjectileHit(damage: number): "accepted" | "ignored" {
    if (!this.state.active || damage <= 0) {
      return "ignored";
    }
    this.state.damageTaken += damage;
    this.state.CurrentHealth = FAMILIAR_HEALTH;
    return "accepted";
  }

  onDeath(_source: NeutralMobDeathSource): void { }
}

function playerFighterKey(key: FighterKey): PlayerFighterKey {
  if (key === "Neutral") {
    throw new Error("Flandre familiar must belong to a player");
  }
  return key;
}

Vanilla.registerCharacter("flandre")(FlandreBattleCharacter);
