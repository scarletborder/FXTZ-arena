import { FamiliarMob, type FamiliarMobState } from "@repo/types";
import type {
  NeutralMobActionContext,
  NeutralMobDeathSource,
} from "@repo/types";

import type {
  BattleBulletSpawnParams,
  BattleLaserSpawnParams,
} from "./base";

export const DEFAULT_FAMILIAR_TEXTURE_KEY = "default-familiar";
export const DEFAULT_FAMILIAR_DISPLAY_RADIUS_MULTIPLIER = 1.2;

export type DefaultFamiliarMovementVariant = "static" | "moving";
export type DefaultFamiliarForm = "normal" | "invisible";

export interface DefaultFamiliarState<TKind extends string = string>
  extends FamiliarMobState {
  readonly kind: TKind;
  readonly textureKey: typeof DEFAULT_FAMILIAR_TEXTURE_KEY;
  movementVariant: DefaultFamiliarMovementVariant;
  form: DefaultFamiliarForm;
  damageTaken: number;
  vx: number;
  vy: number;
  angle: number;
}

export interface DefaultFamiliarStateParams<TKind extends string> {
  readonly id: number;
  readonly key: Exclude<FamiliarMobState["key"], "Neutral">;
  readonly kind: TKind;
  readonly x: number;
  readonly y: number;
  readonly waveId?: number;
  readonly health: number;
  readonly radius: number;
  readonly form?: DefaultFamiliarForm;
  readonly movementVariant?: DefaultFamiliarMovementVariant;
  readonly vx?: number;
  readonly vy?: number;
  readonly angle?: number;
  readonly active?: boolean;
  readonly physicalAttack?: boolean;
  readonly physicalAttackDamage?: number;
}

export interface DefaultFamiliarGeometry {
  readonly radius: number;
  readonly hitSize: number;
  readonly displaySize: number;
}

export function defaultFamiliarGeometry(radius: number): DefaultFamiliarGeometry {
  return {
    radius,
    hitSize: radius * Math.SQRT2,
    displaySize: radius * 2 * DEFAULT_FAMILIAR_DISPLAY_RADIUS_MULTIPLIER,
  };
}

export function createDefaultFamiliarState<TKind extends string>(
  params: DefaultFamiliarStateParams<TKind>,
): DefaultFamiliarState<TKind> {
  const geometry = defaultFamiliarGeometry(params.radius);
  const vx = params.vx ?? 0;
  const vy = params.vy ?? 0;
  return {
    id: params.id,
    key: params.key,
    mobKind: "familiar",
    kind: params.kind,
    textureKey: DEFAULT_FAMILIAR_TEXTURE_KEY,
    x: params.x,
    y: params.y,
    previousX: params.x,
    previousY: params.y,
    hitRadius: params.radius,
    hitWidth: geometry.hitSize,
    hitHeight: geometry.hitSize,
    waveId: params.waveId ?? 0,
    movementVariant:
      params.movementVariant ?? movingVariantFromVelocity(vx, vy),
    form: params.form ?? "normal",
    MaxHealth: params.health,
    CurrentHealth: params.health,
    damageTaken: 0,
    active: params.active ?? true,
    ageTicks: 0,
    physicalAttack: params.physicalAttack,
    physicalAttackDamage: params.physicalAttackDamage,
    sfxFlags: 0,
    vx,
    vy,
    angle: params.angle ?? Math.atan2(vy, vx || 1),
  };
}

export function createDefaultFamiliarClass(radius: number) {
  const geometry = defaultFamiliarGeometry(radius);

  return class DefaultFamiliarBase<
    TState extends DefaultFamiliarState<string>,
  > extends FamiliarMob<TState, BattleBulletSpawnParams, BattleLaserSpawnParams> {
    readonly state: TState;
    readonly geometry = geometry;

    constructor(state: TState) {
      super();
      this.state = state;
      syncDefaultFamiliarMotion(this.state);
    }

    move(): void {
      this.state.x += this.state.vx;
      this.state.y += this.state.vy;
      syncDefaultFamiliarMotion(this.state);
    }

    fire(
      _ctx: NeutralMobActionContext<
        BattleBulletSpawnParams,
        BattleLaserSpawnParams
      >,
    ): void {}

    switchForm(): void {
      syncDefaultFamiliarMotion(this.state);
    }

    die(
      _ctx: NeutralMobActionContext<
        BattleBulletSpawnParams,
        BattleLaserSpawnParams
      >,
    ): void {
      if (this.state.CurrentHealth <= 0) {
        this.state.active = false;
      }
    }

    onProjectileHit(damage: number): "accepted" | "ignored" {
      if (!this.state.active || damage <= 0) {
        return "ignored";
      }
      this.state.damageTaken += damage;
      this.state.CurrentHealth = Math.max(0, this.state.CurrentHealth - damage);
      if (this.state.CurrentHealth <= 0) {
        this.state.active = false;
      }
      return "accepted";
    }

    onDeath(_source: NeutralMobDeathSource): void {}
  };
}

export function syncDefaultFamiliarMotion(
  state: Pick<
    DefaultFamiliarState,
    "vx" | "vy" | "angle" | "movementVariant"
  >,
): void {
  if (Math.abs(state.vx) > 0.001 || Math.abs(state.vy) > 0.001) {
    state.angle = Math.atan2(state.vy, state.vx);
  }
  state.movementVariant = movingVariantFromVelocity(state.vx, state.vy);
}

function movingVariantFromVelocity(
  vx: number,
  vy: number,
): DefaultFamiliarMovementVariant {
  return Math.abs(vx) > 0.001 || Math.abs(vy) > 0.001 ? "moving" : "static";
}
