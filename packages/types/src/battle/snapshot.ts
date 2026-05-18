import type { CharacterId, PlayerId } from "../core";

export interface BattleSnapshot {
  readonly frame: number;
  readonly rngState: string;
  readonly players: readonly PlayerBattleState[];
  readonly projectiles: readonly ProjectileState[];
  readonly effects: readonly EffectState[];
  readonly timers: readonly TimerState[];
  readonly stats: BattleStats;
}

export interface PlayerBattleState {
  readonly playerId: PlayerId;
  readonly x: number;
  readonly y: number;
  readonly facingAngleTicks: number;
  readonly activeCharacterId: CharacterId;
  readonly lives: number;
  readonly bombs: number;
  readonly ammo: number;
  readonly reloadRemainingTicks: number;
  readonly invulnerableRemainingTicks: number;
  readonly actionLockRemainingTicks: number;
}

export interface ProjectileState {
  readonly id: string;
  readonly ownerId: PlayerId;
  readonly x: number;
  readonly y: number;
  readonly velocityX: number;
  readonly velocityY: number;
  readonly angleTicks: number;
  readonly remainingTicks: number;
  readonly shape: ProjectileShape;
}

export interface ProjectileShape {
  readonly kind: "circle" | "rect";
  readonly width: number;
  readonly height: number;
}

export interface EffectState {
  readonly id: string;
  readonly ownerId: PlayerId;
  readonly effectId: string;
  readonly x: number;
  readonly y: number;
  readonly remainingTicks: number;
}

export interface TimerState {
  readonly id: string;
  readonly targetId: string;
  readonly remainingTicks: number;
}

export interface BattleStats {
  readonly damageByPlayerId: Readonly<Record<PlayerId, number>>;
  readonly bombsUsedByPlayerId: Readonly<Record<PlayerId, number>>;
  readonly shotsFiredByPlayerId: Readonly<Record<PlayerId, number>>;
}
