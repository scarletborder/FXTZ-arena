import type { AbilityCardDefinition } from "@repo/content";
import { DEFAULT_BOMBS, hitCircleUnits } from "@repo/types";

import type { EffectState, FighterKey, FighterState, ProjectileState, TrainingStats } from "../types";
import type { EffectSystem } from "../model/effects";
import { clearProjectilesAround, type ProjectileSystem } from "../model/projectile";

export interface BattleCardContext {
  readonly frame: number;
  readonly self: FighterState;
  readonly opponent: FighterState;
  readonly projectiles: ProjectileState[];
  readonly effects: EffectState[];
  readonly stats: TrainingStats;
  readonly projectileSystem: ProjectileSystem;
  readonly effectSystem: EffectSystem;
}

export interface HitResolution {
  defaultBombs: number;
}

export interface BattleHitContext extends BattleCardContext {
  readonly owner: FighterKey;
  readonly victim: FighterState;
  readonly attacker: FighterState;
  readonly damage: number;
  readonly before: {
    readonly victim: FighterState;
    readonly attacker: FighterState;
  };
  readonly cards: {
    readonly victim: readonly AbilityCardDefinition[];
    readonly attacker: readonly AbilityCardDefinition[];
  };
  readonly resolution: HitResolution;
}

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
    clearProjectilesAround(ctx.projectiles, ctx.self.x, ctx.self.y, radius);
    ctx.effectSystem.spawnRing(ctx.effects, ctx.frame, ctx.self.x, ctx.self.y, 0x7ee39d, radius / 100, 28);
  }
}

function applyCardDefaultBombs(definition: AbilityCardDefinition, resolution: HitResolution): void {
  if (definition.effectIds.includes("set_default_bombs_4")) {
    resolution.defaultBombs += 1;
  }
}
