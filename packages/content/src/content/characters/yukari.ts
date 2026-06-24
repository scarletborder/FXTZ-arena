import type { CharacterDefinition, CharacterGalleryAssets } from "./types";

import type {
  FighterKey,
  FighterState,
  ProjectileState,
} from "../battle-types";
import type { BattleHitContext } from "../ability-cards/base";
import {
  BattleCharacter,
  DEFAULT_POINT_COLLECT_RADIUS,
  hitCircleUnits,
  secondsToTicks,
  type CharacterActionContext,
} from "./base";
import { Vanilla } from "../decorators";
import { fp } from "@shaisrc/fixed-point";
import { fpAtan2 } from "../fp";

const CENTER_TEXTURE = "bullet_type_5_offset_3";
const SIDE_TEXTURE = "bullet_type_5_offset_6";
const RAN_BULLET_TEXTURE = "bullet_type_5_offset_13";
const RAN_COMPANION_TEXTURE = "character_ran_companion";

const BULLET_HIT_SIZE = 6;
const CENTER_DAMAGE_BY_TIER = {
  1: 90,
  2: 55,
  3: 50,
  4: 45,
} as const;
const SIDE_DAMAGE = 20;
const RAN_COLLISION_DAMAGE = 1;
const RAN_BULLET_DAMAGE_DEFAULT = 30;
const RAN_BULLET_DAMAGE_TIER3 = 20;
const SNIPER_DAMAGE = 120;
const RAN_SPEED = "low" as const;
const NORMAL_BULLET_SPEED = "medium" as const;
const CENTER_SIDE_GAP = hitCircleUnits(3);
const CENTER_TIER4_GAP = hitCircleUnits(4);
const WINGMAN_FORWARD_OFFSET = -hitCircleUnits(16);
const WINGMAN_SIDE_OFFSET = hitCircleUnits(8);
const RAN_DIRECTION_ALIGN_THRESHOLD = 0.05; // radians

export class YukariBattleCharacter extends BattleCharacter {
  readonly id = "yukari" as CharacterDefinition["id"];
  readonly name = "八云紫";
  readonly cost = 5;
  readonly roleClass = "sniper" as CharacterDefinition["roleClass"];
  readonly moveSpeed = "low" as CharacterDefinition["moveSpeed"];
  readonly fireRate = "low" as CharacterDefinition["fireRate"];
  readonly ammoCapacity = 2;
  readonly reloadTicksPerAmmo = secondsToTicks(1);
  readonly reloadStartPolicy =
    "reset_to_zero" as CharacterDefinition["reloadStartPolicy"];
  readonly reloadCommitPolicy =
    "commit_on_finish" as CharacterDefinition["reloadCommitPolicy"];
  readonly bulletSpeed = NORMAL_BULLET_SPEED;
  readonly description =
    "· 境界的妖怪\n· 低速狙击机体，八云蓝会跟随准心并协同射击\n· 切换到八云紫时八云蓝会重新出现";
  readonly gallery: CharacterGalleryAssets = {
    portraitAsset: "assets/characters/yukari/portrait.png",
    attackPreviewAsset: "assets/characters/yukari/preview.png",
    combatAsset: "assets/characters/yukari/combat.png",
  };
  readonly normalAttackId = "yukari_gap_shot";
  readonly bombId = "yukari_boundary_bomb";
  readonly pointCollectRadius = DEFAULT_POINT_COLLECT_RADIUS;

  shoot(
    ctx: CharacterActionContext,
    fighter: FighterState,
    aimX: number,
    aimY: number,
  ): void {
    const angle = this.aimAngle(fighter, aimX, aimY);
    const tier = this.pointPowerTier(fighter);

    for (const side of centerShotSides(tier)) {
      const position = this.offsetPosition(
        fighter.x,
        fighter.y,
        angle,
        0,
        side,
      );
      this.spawnBullet(ctx, fighter, {
        x: position.x,
        y: position.y,
        angle,
        textureKey: CENTER_TEXTURE,
        damage: CENTER_DAMAGE_BY_TIER[tier],
      });
    }

    if (tier >= 3) {
      for (const side of [-WINGMAN_SIDE_OFFSET, WINGMAN_SIDE_OFFSET]) {
        const position = this.offsetPosition(
          fighter.x,
          fighter.y,
          angle,
          WINGMAN_FORWARD_OFFSET,
          side,
        );
        this.spawnBullet(ctx, fighter, {
          x: position.x,
          y: position.y,
          angle,
          textureKey: SIDE_TEXTURE,
          damage: SIDE_DAMAGE,
        });
      }
    }

    const ran = this.findRanCompanion(ctx, fighter.key);
    if (!ran) {
      return;
    }
    const ranAngle = fpAtan2(
      fp.fromFloat(aimY - ran.y),
      fp.fromFloat(aimX - ran.x),
    );
    this.fireRanBullets(ctx, fighter, ran, ranAngle, tier, angle);
  }

  useBomb(ctx: CharacterActionContext, fighter: FighterState): void {
    this.startBomb(ctx, fighter, secondsToTicks(4));
    const radius = this.clearProjectiles(ctx, fighter, 24, secondsToTicks(1));
    this.spawnClearRing(ctx, fighter, radius, 0xb88cff, secondsToTicks(1));
  }

  onHit(_ctx: BattleHitContext): void {
    // Yukari has no hit-time modifier by default.
  }

  onPostUpdate(ctx: CharacterActionContext, fighter: FighterState): void {
    const existing = this.findRanCompanion(ctx, fighter.key);
    const isActive = fighter.activeCharacter.id === this.id;

    if (
      existing &&
      existing.followAimOwner === fighter.key &&
      existing.followWhileActiveCharacterId === this.id
    ) {
      return;
    }

    if (existing) {
      if (isActive) {
        resetRanCompanion(existing, ctx.frame, fighter);
      } else {
        // Ran companion exists but belongs to a different state.
        // Keep it alive but stationary when Yukari is not active.
        existing.followAimOwner = fighter.key;
        existing.followWhileActiveCharacterId = this.id;
        existing.vx = 0;
        existing.vy = 0;
      }
      return;
    }

    ctx.spawnBullet({
      owner: fighter.key,
      textureKey: RAN_COMPANION_TEXTURE,
      kind: "diamond",
      x: fighter.x,
      y: fighter.y,
      angle: fighter.facing,
      speedRank: RAN_SPEED,
      width: BULLET_HIT_SIZE,
      height: BULLET_HIT_SIZE,
      homingTicks: 0,
      damage: RAN_COLLISION_DAMAGE,
      spawnOffset: 0,
      couldClear: false,
      piercesTargets: true,
      followAimOwner: fighter.key,
      followWhileActiveCharacterId: this.id,
    });
  }

  private fireRanBullets(
    ctx: CharacterActionContext,
    fighter: FighterState,
    ran: ProjectileState,
    ranAngle: number,
    tier: number,
    fighterAngle?: number,
  ): void {
    // When the direction from Ran to crosshair is already aligned with the
    // fighter→crosshair direction, fire a single high-damage sniper bullet.
    if (fighterAngle !== undefined) {
      const angleDiff = normalizeRadians(ranAngle - fighterAngle);
      if (Math.abs(angleDiff) <= RAN_DIRECTION_ALIGN_THRESHOLD) {
        this.spawnBullet(ctx, fighter, {
          x: ran.x,
          y: ran.y,
          angle: ranAngle,
          textureKey: RAN_BULLET_TEXTURE,
          damage: SNIPER_DAMAGE,
        });
        return;
      }
    }

    for (const side of tier >= 3 ? [-CENTER_SIDE_GAP, CENTER_SIDE_GAP] : [0]) {
      const position = this.offsetPosition(ran.x, ran.y, ranAngle, 0, side);
      this.spawnBullet(ctx, fighter, {
        x: position.x,
        y: position.y,
        angle: ranAngle,
        textureKey: RAN_BULLET_TEXTURE,
        damage: tier >= 3 ? RAN_BULLET_DAMAGE_TIER3 : RAN_BULLET_DAMAGE_DEFAULT,
      });
    }
  }

  private spawnBullet(
    ctx: CharacterActionContext,
    fighter: FighterState,
    params: {
      readonly x: number;
      readonly y: number;
      readonly angle: number;
      readonly textureKey: string;
      readonly damage: number;
    },
  ): void {
    ctx.spawnBullet({
      owner: fighter.key,
      sourceCharacterId: this.id,
      textureKey: params.textureKey,
      kind: "orb",
      x: params.x,
      y: params.y,
      angle: params.angle,
      speedRank: NORMAL_BULLET_SPEED,
      width: BULLET_HIT_SIZE,
      height: BULLET_HIT_SIZE,
      homingTicks: 0,
      damage: params.damage,
      spawnOffset: 0,
      couldClear: false,
    });
  }

  private findRanCompanion(
    ctx: CharacterActionContext,
    owner: FighterKey,
  ): ProjectileState | undefined {
    return ctx.projectiles.find(
      (projectile) =>
        projectile.owner === owner &&
        projectile.textureKey === RAN_COMPANION_TEXTURE,
    );
  }
}

function centerShotSides(tier: number): readonly number[] {
  if (tier >= 4) return [-CENTER_TIER4_GAP, 0, CENTER_TIER4_GAP];
  if (tier >= 2) return [-CENTER_SIDE_GAP, CENTER_SIDE_GAP];
  return [0];
}

function normalizeRadians(angle: number): number {
  let normalized = angle;
  while (normalized > Math.PI) normalized -= Math.PI * 2;
  while (normalized < -Math.PI) normalized += Math.PI * 2;
  return normalized;
}

function resetRanCompanion(
  projectile: ProjectileState,
  frame: number,
  fighter: FighterState,
): void {
  const speed = 2;
  const fpAngle = fp.fromFloat(fighter.facing);
  const fpCos = fp.cos(fpAngle);
  const fpSin = fp.sin(fpAngle);
  const fpSpeed = fp.fromFloat(speed);
  Object.assign(projectile, {
    x: fighter.x,
    y: fighter.y,
    previousX: fighter.x,
    previousY: fighter.y,
    vx: fp.toFloat(fp.mul(fpCos, fpSpeed)),
    vy: fp.toFloat(fp.mul(fpSin, fpSpeed)),
    angle: fighter.facing,
    visibleFrom: frame,
    pausedUntil: frame,
    expireAt: undefined,
    rollUntil: 0,
    rollStartedAt: 0,
    followAimOwner: fighter.key,
    followWhileActiveCharacterId: "yukari" as CharacterDefinition["id"],
  });
}

Vanilla.registerCharacter("yukari")(YukariBattleCharacter);
