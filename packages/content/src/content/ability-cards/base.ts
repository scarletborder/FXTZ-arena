import type { AbilityCardDefinition } from "./types";
import type {
  BattleActionContext as StandardBattleActionContext,
  BattleHitContext as StandardBattleHitContext,
  HitResolutionContext,
} from "../battle-ctx";

import type {
  EffectState,
  FighterKey,
  FighterState,
  ProjectileState,
  ShieldState,
  TrainingStats,
} from "../battle-types";
import type {
  BattleBulletSpawnParams,
  BattleLaserSpawnParams,
} from "../characters/base";

interface BattleCardMobState {
  readonly key: string;
  readonly kind: string;
  active: boolean;
}

interface BattleCardMob {
  readonly state: BattleCardMobState;
}

export interface BattleCardContext
  extends StandardBattleActionContext<
    FighterState,
    ProjectileState,
    EffectState,
    TrainingStats,
    BattleBulletSpawnParams,
    BattleLaserSpawnParams,
    BattleCardMob
  > { }

export interface HitResolution extends HitResolutionContext { }

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
  > { }

export interface BattleInitializeContext {
  readonly self: FighterState;
  readonly resolution: HitResolution;
}

export interface BattleGrazeContext {
  readonly projectile: ProjectileState;
  readonly owner: FighterKey;
  readonly victim: FighterState;
  readonly damage: number;
  readonly random: () => number;
}

export interface StoryModeCardOverride {
  onInitialize?(ctx: BattleInitializeContext): void;
  onHit?(ctx: BattleHitContext): void;
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
  readonly storyModeOverride?: StoryModeCardOverride;

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
      collaborateShop: {
        rarity:
          this.id === "extra_life" || this.id === "ember"
            ? "disabled"
            : "common",
      },
    };
  }

  onInitialize(_ctx: BattleInitializeContext): void { }
  onHit(_ctx: BattleHitContext): void { }
  onGraze(_ctx: BattleGrazeContext): boolean {
    return false;
  }
  onAfterFire(_ctx: BattleCardContext): void { }
  onPostUpdate(_ctx: BattleCardContext): void { }
  onUse(_ctx: BattleCardContext): void { }
  getPointCollectRadiusBonus(_fighter: FighterState): number {
    return 0;
  }
  getGrazeRadiusMultiplier(_fighter: FighterState): number {
    return 1;
  }
  collectShields(_fighter: FighterState, _frame: number): ShieldState[] {
    return [];
  }
}
