import type { AbilityCardDefinition } from "./types";
import type {
  BattleActionContext as StandardBattleActionContext,
  BattleHitContext as StandardBattleHitContext,
  HitResolutionContext,
} from "../battle-ctx";

import type { EffectState, FighterKey, FighterState, ProjectileState, ShieldState, TrainingStats } from "../battle-types";
import type { BattleBulletSpawnParams, BattleLaserSpawnParams } from "../characters/base";

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

export interface BattleInitializeContext {
  readonly self: FighterState;
  readonly resolution: HitResolution;
}

export abstract class BattleAbilityCard {
  abstract readonly id: AbilityCardDefinition["id"];
  abstract readonly name: AbilityCardDefinition["name"];
  abstract readonly cost: AbilityCardDefinition["cost"];
  abstract readonly kind: AbilityCardDefinition["kind"];
  abstract readonly useLimit: AbilityCardDefinition["useLimit"];
  abstract readonly cooldownTicks: AbilityCardDefinition["cooldownTicks"];
  abstract readonly description: AbilityCardDefinition["description"];
  abstract readonly gallery: AbilityCardDefinition["gallery"];

  get definition(): AbilityCardDefinition {
    return {
      id: this.id,
      name: this.name,
      cost: this.cost,
      kind: this.kind,
      useLimit: this.useLimit,
      cooldownTicks: this.cooldownTicks,
      description: this.description,
      gallery: this.gallery,
    };
  }

  onInitialize(_ctx: BattleInitializeContext): void {}
  onHit(_ctx: BattleHitContext): void {}
  onAfterFire(_ctx: BattleCardContext): void {}
  onPostUpdate(_ctx: BattleCardContext): void {}
  onUse(_ctx: BattleCardContext): void {}
  collectShields(_fighter: FighterState): ShieldState[] {
    return [];
  }
}
