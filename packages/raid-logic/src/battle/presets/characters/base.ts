import type { CharacterDefinition } from "@repo/content";
import { hitCircleUnits, secondsToTicks } from "@repo/types";

import type { EffectState, FighterState, ProjectileState, TrainingStats } from "../../types";
import type { EffectSystem } from "../../model/effects";
import { clearProjectilesAround, type ProjectileSystem } from "../../model/projectile";
import type { BattleHitContext } from "../ability-cards";

const STATUS_VISIBLE_TICKS = secondsToTicks(1.5);

export interface CharacterActionContext {
  readonly frame: number;
  readonly self: FighterState;
  readonly opponent: FighterState;
  readonly projectiles: ProjectileState[];
  readonly effects: EffectState[];
  readonly stats: TrainingStats;
  readonly projectileSystem: ProjectileSystem;
  readonly effectSystem: EffectSystem;
}

export abstract class BattleCharacter {
  protected constructor(readonly definition: CharacterDefinition) {}

  abstract readonly moveSpeed: CharacterDefinition["moveSpeed"];
  abstract readonly fireRate: CharacterDefinition["fireRate"];
  abstract readonly ammoCapacity: number;
  abstract readonly reloadTicksPerAmmo: number;
  get reloadStartPolicy(): CharacterDefinition["reloadStartPolicy"] {
    return this.definition.reloadStartPolicy;
  }

  get reloadCommitPolicy(): CharacterDefinition["reloadCommitPolicy"] {
    return this.definition.reloadCommitPolicy;
  }

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
    clearProjectilesAround(ctx.projectiles, fighter.x, fighter.y, radius);
    return radius;
  }

  protected spawnClearRing(ctx: CharacterActionContext, fighter: FighterState, radius: number, tint: number, duration: number): void {
    ctx.effectSystem.spawnRing(ctx.effects, ctx.frame, fighter.x, fighter.y, tint, radius / 100, duration);
  }

  protected useSpiritStrike(ctx: CharacterActionContext, fighter: FighterState, tint: number): void {
    const radius = this.clearProjectiles(ctx, fighter, 4);
    this.spawnClearRing(ctx, fighter, radius, tint, 28);
  }
}

export { hitCircleUnits, secondsToTicks };
