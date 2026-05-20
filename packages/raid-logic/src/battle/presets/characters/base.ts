import type { CharacterDefinition, CharacterGalleryAssets } from "@repo/content";
import { hitCircleUnits, secondsToTicks, type BattleActionContext as StandardBattleActionContext } from "@repo/types";

import type { EffectState, FighterState, ProjectileState, TrainingStats } from "../../types";
import type { BulletProjectileParams, LaserProjectileParams } from "../../model/projectile";
import type { BattleHitContext } from "../ability-cards";

const STATUS_VISIBLE_TICKS = secondsToTicks(1.5);

export type BattleBulletSpawnParams = Omit<BulletProjectileParams, "frame"> & { readonly frame?: number };
export type BattleLaserSpawnParams = Omit<LaserProjectileParams, "frame"> & { readonly frame?: number };

export interface CharacterActionContext
  extends StandardBattleActionContext<
    FighterState,
    ProjectileState,
    EffectState,
    TrainingStats,
    BattleBulletSpawnParams,
    BattleLaserSpawnParams
  > {}

export abstract class BattleCharacter {
  abstract readonly id: CharacterDefinition["id"];
  abstract readonly name: CharacterDefinition["name"];
  abstract readonly cost: CharacterDefinition["cost"];
  abstract readonly roleClass: CharacterDefinition["roleClass"];
  abstract readonly description: CharacterDefinition["description"];
  abstract readonly gallery: CharacterDefinition["gallery"];
  abstract readonly normalAttackId: CharacterDefinition["normalAttackId"];
  abstract readonly bombId: CharacterDefinition["bombId"];

  abstract readonly moveSpeed: CharacterDefinition["moveSpeed"];
  abstract readonly fireRate: CharacterDefinition["fireRate"];
  abstract readonly ammoCapacity: CharacterDefinition["ammoCapacity"];
  abstract readonly reloadTicksPerAmmo: CharacterDefinition["reloadTicksPerAmmo"];
  abstract readonly reloadStartPolicy: CharacterDefinition["reloadStartPolicy"];
  abstract readonly reloadCommitPolicy: CharacterDefinition["reloadCommitPolicy"];

  abstract shoot(ctx: CharacterActionContext, fighter: FighterState, aimX: number, aimY: number): void;
  abstract useBomb(ctx: CharacterActionContext, fighter: FighterState): void;
  abstract onHit(ctx: BattleHitContext): void;

  protected aimAngle(fighter: FighterState, aimX: number, aimY: number): number {
    return Math.atan2(aimY - fighter.y, aimX - fighter.x);
  }

  protected angleToOpponent(ctx: CharacterActionContext, fighter: FighterState): number {
    return Math.atan2(ctx.opponent.y - fighter.y, ctx.opponent.x - fighter.x);
  }

  protected startBomb(ctx: CharacterActionContext, fighter: FighterState, cooldownTicks = 60): void {
    fighter.bombs -= 1;
    fighter.bombUses += 1;
    fighter.statusVisibleUntil = ctx.frame + STATUS_VISIBLE_TICKS;
    fighter.bombCooldownUntil = cooldownTicks;
    ctx.stats.bombUses += 1;
  }

  protected setInvulnerable(fighter: FighterState, ticks: number): void {
    fighter.invulnerableUntil = Math.max(fighter.invulnerableUntil, ticks);
  }

  protected clearProjectiles(ctx: CharacterActionContext, fighter: FighterState, hitCircleMultiplier: number): number {
    const radius = hitCircleUnits(hitCircleMultiplier);
    ctx.clearProjectilesAround({ x: fighter.x, y: fighter.y, radius });
    return radius;
  }

  protected spawnClearRing(ctx: CharacterActionContext, fighter: FighterState, radius: number, tint: number, duration: number): void {
    ctx.spawnClearRing({ x: fighter.x, y: fighter.y, radius, tint, duration });
  }

  protected useSpiritStrike(ctx: CharacterActionContext, fighter: FighterState, tint: number): void {
    const radius = this.clearProjectiles(ctx, fighter, 4);
    this.spawnClearRing(ctx, fighter, radius, tint, 28);
  }
}

export { hitCircleUnits, secondsToTicks };
