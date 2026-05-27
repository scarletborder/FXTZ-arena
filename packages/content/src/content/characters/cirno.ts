import { fp } from "@shaisrc/fixed-point";

import type { CharacterDefinition, CharacterGalleryAssets } from "./types";

import type { FighterState, ProjectileState } from "../battle-types";
import type { BattleHitContext } from "../ability-cards/base";
import {
  BattleCharacter,
  DEFAULT_POINT_COLLECT_RADIUS,
  hitCircleUnits,
  secondsToTicks,
  type CharacterActionContext,
} from "./base";
import { fpAtan2 } from "../fp";
import { Vanilla } from "../decorators";

const SIDE_OFFSET = hitCircleUnits(5);
const REAR_OFFSET = -hitCircleUnits(10);
const CENTER_GAP = hitCircleUnits(3);
const BULLET_SIZE = hitCircleUnits(2);
const BOMB_RADIUS_MULTIPLIER = 36;
const BOMB_BULLET_DAMAGE = 10;
const NORMAL_BULLET_DAMAGE = 10;

@Vanilla.RegisterCharacter("cirno")
export class CirnoBattleCharacter extends BattleCharacter {
  readonly id = "cirno" as CharacterDefinition["id"];
  readonly name = "Cirno";
  readonly cost = 4;
  readonly roleClass = "suppress" as CharacterDefinition["roleClass"];
  readonly moveSpeed = "medium" as CharacterDefinition["moveSpeed"];
  readonly fireRate = "medium" as CharacterDefinition["fireRate"];
  readonly ammoCapacity = 4;
  readonly reloadTicksPerAmmo = secondsToTicks(0.9);
  readonly reloadStartPolicy =
    "keep_current" as CharacterDefinition["reloadStartPolicy"];
  readonly reloadCommitPolicy =
    "commit_per_ammo" as CharacterDefinition["reloadCommitPolicy"];
  readonly bulletSpeed = "medium" as CharacterDefinition["bulletSpeed"];
  readonly pointBombThreshold: number = 250;
  readonly pointBombCost: number = 150;
  readonly pointCollectRadius = DEFAULT_POINT_COLLECT_RADIUS;
  readonly description =
    "背后展开中速冰晶弹幕，并用 bomb 将近身弹幕冻结后反推出去。";
  readonly gallery: CharacterGalleryAssets = {
    portraitAsset: "assets/characters/cirno/portrait.png",
    attackPreviewAsset: "assets/characters/cirno/attack-preview.png",
    combatAsset: "assets/characters/cirno/combat.png",
  };
  readonly normalAttackId = "cirno_ice_crystals";
  readonly bombId = "cirno_perfect_freeze";

  shoot(
    ctx: CharacterActionContext,
    fighter: FighterState,
    aimX: number,
    aimY: number,
  ): void {
    const angle = this.aimAngle(fighter, aimX, aimY);
    const tier = this.pointPowerTier(fighter);
    const sideRepeats = tier >= 3 ? 2 : 1;

    for (let repeat = 0; repeat < sideRepeats; repeat += 1) {
      this.spawnRearSideShots(ctx, fighter, angle, aimX, aimY, repeat * 6);
    }

    if (tier >= 2) {
      const centerOffsets = tier >= 4 ? [-CENTER_GAP, 0, CENTER_GAP] : [0];
      for (const sideOffset of centerOffsets) {
        const position = this.offsetPosition(
          fighter.x,
          fighter.y,
          angle,
          0,
          sideOffset,
        );
        this.spawnIceBullet(ctx, fighter, position.x, position.y, angle);
      }
    }
  }

  useBomb(ctx: CharacterActionContext, fighter: FighterState): void {
    this.startBomb(ctx, fighter);
    this.setInvulnerable(fighter, secondsToTicks(1));

    const radius = hitCircleUnits(BOMB_RADIUS_MULTIPLIER);
    const converted = this.collectBombTargets(ctx.projectiles, fighter, radius);
    ctx.projectiles.splice(
      0,
      ctx.projectiles.length,
      ...ctx.projectiles.filter(
        (projectile) =>
          !converted.some((target) => target.id === projectile.id),
      ),
    );

    ctx.spawnClearRingEntity({
      x: fighter.x,
      y: fighter.y,
      radius,
      duration: secondsToTicks(0.5),
      followsOwner: false,
    });
    this.spawnClearRing(ctx, fighter, radius, 0x9be8ff, secondsToTicks(0.5));

    for (const projectile of converted) {
      const angle = fpAtan2(
        fp.fromFloat(projectile.y - fighter.y),
        fp.fromFloat(projectile.x - fighter.x),
      );
      this.spawnIceBullet(
        ctx,
        fighter,
        projectile.x,
        projectile.y,
        angle,
        "high",
        BOMB_BULLET_DAMAGE,
      );
    }
  }

  onHit(_ctx: BattleHitContext): void {
    // Cirno has no hit-time modifier by default.
  }

  private spawnRearSideShots(
    ctx: CharacterActionContext,
    fighter: FighterState,
    angle: number,
    aimX: number,
    aimY: number,
    frameDelay: number,
  ): void {
    for (const side of [-1, 1]) {
      const position = this.offsetPosition(
        fighter.x,
        fighter.y,
        angle,
        REAR_OFFSET,
        side * SIDE_OFFSET,
      );
      const shotAngle = fpAtan2(
        fp.fromFloat(aimY - position.y),
        fp.fromFloat(aimX - position.x),
      );
      this.spawnIceBullet(
        ctx,
        fighter,
        position.x,
        position.y,
        shotAngle,
        "medium",
        NORMAL_BULLET_DAMAGE,
        ctx.frame + frameDelay,
      );
    }
  }

  private spawnIceBullet(
    ctx: CharacterActionContext,
    fighter: FighterState,
    x: number,
    y: number,
    angle: number,
    speedRank: "medium" | "high" = "medium",
    damage = NORMAL_BULLET_DAMAGE,
    frame = ctx.frame,
  ): void {
    ctx.spawnBullet({
      owner: fighter.key,
      kind: "diamond",
      x,
      y,
      angle,
      speedRank,
      width: BULLET_SIZE,
      height: BULLET_SIZE,
      homingTicks: 0,
      damage,
      spawnOffset: 0,
      frame,
      couldClear: true,
    });
  }

  private collectBombTargets(
    projectiles: readonly ProjectileState[],
    fighter: FighterState,
    radius: number,
  ): readonly ProjectileState[] {
    return projectiles.filter((projectile) => {
      if (!projectile.couldClear || projectile.owner === fighter.key) {
        return false;
      }
      const dx = projectile.x - fighter.x;
      const dy = projectile.y - fighter.y;
      return Math.hypot(dx, dy) <= radius;
    });
  }
}
