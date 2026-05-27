import { ARENA_HEIGHT, ARENA_WIDTH } from "@repo/constants";
import { NeutralMob, type NeutralMobActionContext, type NeutralMobDeathSource, type NeutralMobState } from "@repo/types";

import type { BattleBulletSpawnParams, BattleLaserSpawnParams } from "../../characters/base";

export interface ImmortalFairyState extends NeutralMobState {
  readonly kind: "immortal_fairy";
  damageTaken: number;
}

const HIT_SIZE = 48;
const HEALTH = Number.MAX_SAFE_INTEGER;
const POSITION = { x: ARENA_WIDTH / 2, y: ARENA_HEIGHT * 0.28 };

export class ImmortalFairy extends NeutralMob<ImmortalFairyState, BattleBulletSpawnParams, BattleLaserSpawnParams> {
  readonly state: ImmortalFairyState;

  constructor(params: { readonly id: number }) {
    super();
    this.state = {
      id: params.id,
      key: "Neutral",
      kind: "immortal_fairy",
      textureKey: "enemy_type_2",
      x: POSITION.x,
      y: POSITION.y,
      previousX: POSITION.x,
      previousY: POSITION.y,
      hitRadius: HIT_SIZE / 2,
      hitWidth: HIT_SIZE,
      hitHeight: HIT_SIZE,
      waveId: 1,
      movementVariant: "static",
      form: "idle",
      MaxHealth: HEALTH,
      CurrentHealth: HEALTH,
      damageTaken: 0,
      active: true,
      ageTicks: 0,
      sfxFlags: 0,
    };
  }

  static fromSnapshot(snapshot: NeutralMobState): ImmortalFairy {
    const mob = new ImmortalFairy({ id: snapshot.id });
    mob.restore(snapshot as ImmortalFairyState);
    return mob;
  }

  move(): void {
    this.state.previousX = this.state.x;
    this.state.previousY = this.state.y;
  }

  fire(_ctx: NeutralMobActionContext<BattleBulletSpawnParams, BattleLaserSpawnParams>): void {
    // Training target does not attack.
  }

  switchForm(): void {
    // Training target keeps a stable visual form.
  }

  die(): void {
    this.state.active = true;
    this.state.CurrentHealth = HEALTH;
  }

  onDeath(_source: NeutralMobDeathSource): void {
    // Immortal training target never dies.
  }

  onProjectileHit(damage: number): "accepted" | "ignored" {
    if (!this.state.active || damage <= 0) {
      return "ignored";
    }
    this.state.damageTaken += damage;
    this.state.CurrentHealth = HEALTH;
    return "accepted";
  }
}
