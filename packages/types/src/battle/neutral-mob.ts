export type NeutralMobId = number;
export type NeutralMobBehavior = "move" | "fire" | "switch_form" | "die";

export interface NeutralMobState {
  readonly id: NeutralMobId;
  readonly key: "Neutral";
  readonly kind: string;
  x: number;
  y: number;
  previousX: number;
  previousY: number;
  hitRadius: number;
  waveId: number;
  movementVariant: string;
  form: string;
  MaxHealth: number;
  CurrentHealth: number;
  active: boolean;
  ageTicks: number;
}

export interface NeutralMobTargetState {
  readonly x: number;
  readonly y: number;
}

export interface NeutralMobActionContext<TBulletParams, TLaserParams> {
  readonly frame: number;
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

  abstract move(ctx: NeutralMobActionContext<TBulletParams, TLaserParams>): void;
  abstract fire(ctx: NeutralMobActionContext<TBulletParams, TLaserParams>): void;
  abstract switchForm(ctx: NeutralMobActionContext<TBulletParams, TLaserParams>): void;
  abstract die(ctx: NeutralMobActionContext<TBulletParams, TLaserParams>): void;
  abstract onProjectileHit(damage: number): "accepted" | "ignored";

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
  }

  snapshot(): TState {
    return { ...this.state };
  }

  restore(snapshot: TState): void {
    Object.assign(this.state, snapshot);
  }
}
