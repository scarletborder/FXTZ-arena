import type { AbilityCardDefinition } from "@repo/content";
import {
  DEFAULT_BOMBS,
  hitCircleUnits,
  type BattleActionContext as StandardBattleActionContext,
  type BattleHitContext as StandardBattleHitContext,
  type HitResolutionContext,
} from "@repo/types";

import type { EffectState, FighterKey, FighterState, ProjectileState, TrainingStats } from "../types";
import type { BattleBulletSpawnParams, BattleLaserSpawnParams } from "./characters";

export interface BattleCardContext
  extends StandardBattleActionContext<
    FighterState,
    ProjectileState,
    EffectState,
    TrainingStats,
    BattleBulletSpawnParams,
    BattleLaserSpawnParams
  > {}

export interface HitResolution extends HitResolutionContext {}

export interface BattleHitContext
  extends StandardBattleHitContext<
    FighterState,
    ProjectileState,
    EffectState,
    TrainingStats,
    BattleBulletSpawnParams,
    BattleLaserSpawnParams,
    AbilityCardDefinition,
    FighterKey
  > {}

export interface BattleAbilityCard {
  readonly definition: AbilityCardDefinition;
  onHit(ctx: BattleHitContext): void;
  onUse(ctx: BattleCardContext): void;
}

export function createBattleAbilityCard(definition: AbilityCardDefinition): BattleAbilityCard {
  return new DefaultBattleAbilityCard(definition);
}

export function getInitialBombs(cards: readonly AbilityCardDefinition[]): number {
  const resolution: HitResolution = { defaultBombs: DEFAULT_BOMBS };
  for (const card of cards) {
    applyCardDefaultBombs(card, resolution);
  }
  return resolution.defaultBombs;
}

class DefaultBattleAbilityCard implements BattleAbilityCard {
  constructor(readonly definition: AbilityCardDefinition) {}

  onHit(ctx: BattleHitContext): void {
    applyCardDefaultBombs(this.definition, ctx.resolution);
  }

  onUse(ctx: BattleCardContext): void {
    if (!this.definition.effectIds.includes("clear_projectiles_radius_4")) {
      return;
    }
    const radius = hitCircleUnits(4);
    ctx.clearProjectilesAround({ x: ctx.self.x, y: ctx.self.y, radius });
    ctx.spawnClearRing({ x: ctx.self.x, y: ctx.self.y, radius, tint: 0x7ee39d, duration: 28 });
  }
}

function applyCardDefaultBombs(definition: AbilityCardDefinition, resolution: HitResolution): void {
  if (definition.effectIds.includes("set_default_bombs_4")) {
    resolution.defaultBombs += 1;
  }
}
