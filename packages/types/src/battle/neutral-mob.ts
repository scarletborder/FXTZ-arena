import type { BattlePlayerId, CharacterId } from "../core";
import type {
  ArenaBounds,
  MoneyRewardSize,
  PointRewardSize,
  PowerRewardSize,
} from "@repo/constants";

export type NeutralMobId = number;
export type MobId = NeutralMobId;
export type MobOwner = BattlePlayerId;
export type NeutralMobBehavior = "move" | "fire" | "switch_form" | "die";
export type NeutralMobDeathSource = BattlePlayerId | null;
export type NeutralMobClass = "minion" | "elite" | "boss";
export type NeutralMobSpellPhase = "non_spell" | "spell_card";
export type MobKind = "neutral" | "familiar";

export interface NeutralMobSpellCardDefinitionState {
  readonly id: string;
  readonly displayName: string;
  readonly maxHealth: number;
  readonly durationTicks: number;
}

export interface NeutralMobSpellCardState {
  readonly phase: NeutralMobSpellPhase;
  readonly spellCardIndex: number;
  readonly totalSpellCards: number;
  readonly remainingSpellCards: number;
  readonly currentHealth: number;
  readonly maxHealth: number;
  readonly nonSpellMaxHealth: number;
  readonly nonSpellThresholdHealth: number;
  readonly remainingTicks: number;
  readonly activeSpellCardName?: string;
  readonly spellCards: readonly NeutralMobSpellCardDefinitionState[];
}

export interface NeutralMobRewardDropState {
  readonly size: PointRewardSize | MoneyRewardSize | PowerRewardSize;
  readonly count?: number;
}

export interface MobState {
  readonly id: NeutralMobId;
  readonly key: MobOwner;
  readonly mobKind?: MobKind;
  readonly kind: string;
  readonly class?: NeutralMobClass;
  readonly displayName?: string;
  readonly textureKey?: string;
  readonly characterId?: CharacterId;
  x: number;
  y: number;
  previousX: number;
  previousY: number;
  hitRadius: number;
  hitWidth?: number;
  hitHeight?: number;
  waveId: number;
  movementVariant: string;
  form: string;
  MaxHealth: number;
  CurrentHealth: number;
  pointRewardSize?: PointRewardSize;
  moneyRewardSize?: MoneyRewardSize;
  powerRewardSize?: PowerRewardSize;
  pointRewardDrops?: readonly NeutralMobRewardDropState[];
  moneyRewardDrops?: readonly NeutralMobRewardDropState[];
  powerRewardDrops?: readonly NeutralMobRewardDropState[];
  damageTaken?: number;
  active: boolean;
  ageTicks: number;
  physicalAttack?: boolean;
  physicalAttackDamage?: number;
  rollUntil?: number;
  rollStartedAt?: number;
  /** Bitmask of SFX flags for the renderer. */
  sfxFlags: number;
  spellCard?: NeutralMobSpellCardState;
}

export interface NeutralMobState extends MobState {
  readonly key: "Neutral";
  readonly mobKind?: "neutral";
}

export interface FamiliarMobState extends MobState {
  readonly key: Exclude<BattlePlayerId, "Neutral">;
  readonly mobKind: "familiar";
}

export interface NeutralMobTargetState {
  readonly key?: MobOwner;
  readonly mobId?: NeutralMobId;
  readonly x: number;
  readonly y: number;
}

export interface MobActionContext<TBulletParams, TLaserParams> {
  readonly frame: number;
  readonly arenaBounds: ArenaBounds;
  readonly owner: MobOwner;
  readonly player: NeutralMobTargetState;
  readonly target: NeutralMobTargetState;
  readonly enemyTargets?: readonly NeutralMobTargetState[];
  spawnBullet(params: TBulletParams): void;
  spawnLaser(params: TLaserParams): void;
}

export type NeutralMobActionContext<TBulletParams, TLaserParams> =
  MobActionContext<TBulletParams, TLaserParams>;

export abstract class Mob<
  TState extends MobState = MobState,
  TBulletParams = unknown,
  TLaserParams = unknown,
> {
  abstract readonly state: TState;

  get id(): NeutralMobId {
    return this.state.id;
  }

  abstract move(ctx: MobActionContext<TBulletParams, TLaserParams>): void;
  abstract fire(ctx: MobActionContext<TBulletParams, TLaserParams>): void;
  abstract switchForm(ctx: MobActionContext<TBulletParams, TLaserParams>): void;
  abstract die(ctx: MobActionContext<TBulletParams, TLaserParams>): void;
  abstract onProjectileHit(damage: number): "accepted" | "ignored";
  abstract onDeath(source: NeutralMobDeathSource): void;

  /** Called when the mob becomes inactive (death). Override for death effects. */
  onDeathEffect(): void {
    // No-op by default.
  }

  step(ctx: NeutralMobActionContext<TBulletParams, TLaserParams>): void {
    if (!this.state.active) {
      return;
    }
    this.state.previousX = this.state.x;
    this.state.previousY = this.state.y;
    this.state.ageTicks += 1;
    this.move(ctx);
    this.fire(ctx);
    this.switchForm(ctx);
    this.die(ctx);
    this.state.sfxFlags = 0;
  }

  snapshot(): TState {
    return { ...this.state };
  }

  restore(snapshot: TState): void {
    Object.assign(this.state, snapshot);
  }
}

export abstract class NeutralMob<
  TState extends NeutralMobState = NeutralMobState,
  TBulletParams = unknown,
  TLaserParams = unknown,
> extends Mob<TState, TBulletParams, TLaserParams> {}

export abstract class FamiliarMob<
  TState extends FamiliarMobState = FamiliarMobState,
  TBulletParams = unknown,
  TLaserParams = unknown,
> extends Mob<TState, TBulletParams, TLaserParams> {}
