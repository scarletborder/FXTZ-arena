import type { BattlePlayerId } from "../core";
import type {
  ArenaBounds,
  MoneyRewardSize,
  PointRewardSize,
  PowerRewardSize,
} from "@repo/constants";

export type NeutralMobId = number;
export type NeutralMobBehavior = "move" | "fire" | "switch_form" | "die";
export type NeutralMobDeathSource = BattlePlayerId | null;
export type NeutralMobClass = "minion" | "elite" | "boss";
export type NeutralMobSpellPhase = "non_spell" | "spell_card";

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

export interface NeutralMobState {
  readonly id: NeutralMobId;
  readonly key: "Neutral";
  readonly kind: string;
  readonly class?: NeutralMobClass;
  readonly displayName?: string;
  readonly textureKey?: string;
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
  damageTaken?: number;
  active: boolean;
  ageTicks: number;
  /** Bitmask of SFX flags for the renderer. */
  sfxFlags: number;
  spellCard?: NeutralMobSpellCardState;
}

export interface NeutralMobTargetState {
  readonly x: number;
  readonly y: number;
}

export interface NeutralMobActionContext<TBulletParams, TLaserParams> {
  readonly frame: number;
  readonly arenaBounds: ArenaBounds;
  readonly player: NeutralMobTargetState;
  readonly target: NeutralMobTargetState;
  spawnBullet(params: TBulletParams): void;
  spawnLaser(params: TLaserParams): void;
}

export abstract class NeutralMob<
  TState extends NeutralMobState = NeutralMobState,
  TBulletParams = unknown,
  TLaserParams = unknown,
> {
  abstract readonly state: TState;

  get id(): NeutralMobId {
    return this.state.id;
  }

  abstract move(
    ctx: NeutralMobActionContext<TBulletParams, TLaserParams>,
  ): void;
  abstract fire(
    ctx: NeutralMobActionContext<TBulletParams, TLaserParams>,
  ): void;
  abstract switchForm(
    ctx: NeutralMobActionContext<TBulletParams, TLaserParams>,
  ): void;
  abstract die(ctx: NeutralMobActionContext<TBulletParams, TLaserParams>): void;
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
