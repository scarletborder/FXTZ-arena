import type { FamiliarMobState, NeutralMobDeathSource } from "@repo/types";
import { FamiliarMob } from "@repo/types";

import type {
  BattleBulletSpawnParams,
  BattleLaserSpawnParams,
} from "../characters/base";
import { registerFamiliarSnapshotFactory } from "../characters/familiar-snapshot";
import type { BattleCardContext } from "./base";
import type { FighterKey, FighterState } from "../battle-types";

export const BACKDOOR_FAMILIAR_KIND = "backdoor_familiar";
export const UFO_HELPER_FAMILIAR_KIND = "ufo_helper_familiar";
export const BACKDOOR_FAMILIAR_TEXTURE_KEY = "card-backdoor-familiar";
export const UFO_HELPER_FAMILIAR_TEXTURE_KEY = "card-ufo-helper-familiar";

const BACKDOOR_FAMILIAR_ID = {
  Player1: -1101,
  Player2: -1102,
} as const;
const UFO_HELPER_FAMILIAR_ID = {
  Player1: -1111,
  Player2: -1112,
} as const;
const INFINITE_FAMILIAR_HEALTH = Number.MAX_SAFE_INTEGER;
const UFO_HELPER_ORBIT_RADIUS = 56;
const UFO_HELPER_ROTATION_SPEED = -(Math.PI * 2) / 180;

type DefensiveFamiliarKind =
  | typeof BACKDOOR_FAMILIAR_KIND
  | typeof UFO_HELPER_FAMILIAR_KIND;
type DefensiveFamiliarTextureKey =
  | typeof BACKDOOR_FAMILIAR_TEXTURE_KEY
  | typeof UFO_HELPER_FAMILIAR_TEXTURE_KEY;

type PlayerFighterKey = Exclude<FighterKey, "Neutral">;

export interface DefensiveFamiliarState extends FamiliarMobState {
  readonly kind:
    | typeof BACKDOOR_FAMILIAR_KIND
    | typeof UFO_HELPER_FAMILIAR_KIND;
  readonly textureKey:
    | typeof BACKDOOR_FAMILIAR_TEXTURE_KEY
    | typeof UFO_HELPER_FAMILIAR_TEXTURE_KEY;
  movementVariant: "static";
  form: "default";
  damageTaken: number;
  angle: number;
}

abstract class DefensiveFamiliar<
  TState extends DefensiveFamiliarState,
> extends FamiliarMob<TState, BattleBulletSpawnParams, BattleLaserSpawnParams> {
  readonly state: TState;

  constructor(state: TState) {
    super();
    this.state = state;
  }

  move(): void {}
  fire(): void {}
  switchForm(): void {}
  die(): void {
    this.state.active = true;
    this.state.CurrentHealth = INFINITE_FAMILIAR_HEALTH;
  }

  onProjectileHit(damage: number): "accepted" | "ignored" {
    if (!this.state.active || damage <= 0) {
      return "ignored";
    }
    this.state.damageTaken += damage;
    this.state.CurrentHealth = INFINITE_FAMILIAR_HEALTH;
    return "accepted";
  }

  onDeath(_source: NeutralMobDeathSource): void {}
}

export class BackdoorFamiliar extends DefensiveFamiliar<DefensiveFamiliarState> {
  constructor(state: DefensiveFamiliarState) {
    super(state);
  }

  static create(
    owner: PlayerFighterKey,
    fighter: Pick<FighterState, "x" | "y" | "facing">,
  ): BackdoorFamiliar {
    const state = createDefensiveFamiliarState({
      id: BACKDOOR_FAMILIAR_ID[owner],
      key: owner,
      kind: BACKDOOR_FAMILIAR_KIND,
      textureKey: BACKDOOR_FAMILIAR_TEXTURE_KEY,
      x: fighter.x,
      y: fighter.y,
      hitRadius: 17,
      hitWidth: 7,
      hitHeight: 34,
      angle: fighter.facing,
    });
    syncBackdoorFamiliar(state, fighter);
    return new BackdoorFamiliar(state);
  }

  static fromSnapshot(snapshot: DefensiveFamiliarState): BackdoorFamiliar {
    return new BackdoorFamiliar({ ...snapshot });
  }
}

export class UfoHelperFamiliar extends DefensiveFamiliar<DefensiveFamiliarState> {
  constructor(state: DefensiveFamiliarState) {
    super({
      ...state,
    });
  }

  static create(
    owner: PlayerFighterKey,
    fighter: Pick<FighterState, "x" | "y">,
  ): UfoHelperFamiliar {
    const state = createDefensiveFamiliarState({
      id: UFO_HELPER_FAMILIAR_ID[owner],
      key: owner,
      kind: UFO_HELPER_FAMILIAR_KIND,
      textureKey: UFO_HELPER_FAMILIAR_TEXTURE_KEY,
      x: fighter.x,
      y: fighter.y,
      hitRadius: 11,
      hitWidth: 22,
      hitHeight: 22,
      angle: 0,
    });
    syncUfoHelperFamiliar(state, fighter, 0);
    return new UfoHelperFamiliar(state);
  }

  static fromSnapshot(snapshot: DefensiveFamiliarState): UfoHelperFamiliar {
    return new UfoHelperFamiliar({ ...snapshot });
  }
}

registerFamiliarSnapshotFactory((snapshot) => {
  if (snapshot.kind === BACKDOOR_FAMILIAR_KIND) {
    return BackdoorFamiliar.fromSnapshot(snapshot as DefensiveFamiliarState);
  }
  if (snapshot.kind === UFO_HELPER_FAMILIAR_KIND) {
    return UfoHelperFamiliar.fromSnapshot(snapshot as DefensiveFamiliarState);
  }
  return undefined;
});

export function ensureBackdoorFamiliar(
  ctx: BattleCardContext,
  fighter: FighterState,
): void {
  if (fighter.key === "Neutral") {
    return;
  }
  const existing = findDefensiveFamiliar(ctx, fighter.key, BACKDOOR_FAMILIAR_KIND);
  if (existing) {
    syncBackdoorFamiliar(existing, fighter);
    return;
  }
  ctx.spawnMob?.(BackdoorFamiliar.create(fighter.key, fighter));
}

export function ensureUfoHelperFamiliar(
  ctx: BattleCardContext,
  fighter: FighterState,
): void {
  if (fighter.key === "Neutral") {
    return;
  }
  const existing = findDefensiveFamiliar(ctx, fighter.key, UFO_HELPER_FAMILIAR_KIND);
  if (existing) {
    syncUfoHelperFamiliar(existing, fighter, ctx.frame);
    return;
  }
  ctx.spawnMob?.(UfoHelperFamiliar.create(fighter.key, fighter));
}

function findDefensiveFamiliar(
  ctx: BattleCardContext,
  owner: "Player1" | "Player2",
  kind: DefensiveFamiliarState["kind"],
): DefensiveFamiliarState | undefined {
  return (ctx.mobs as readonly { readonly state: DefensiveFamiliarState }[] | undefined)
    ?.map((mob) => mob.state)
    .find(
      (mob): mob is DefensiveFamiliarState =>
        mob.key === owner && mob.kind === kind,
    );
}

function syncBackdoorFamiliar(
  familiar: DefensiveFamiliarState,
  fighter: Pick<FighterState, "x" | "y" | "facing">,
): void {
  const distance = 64;
  familiar.active = true;
  familiar.previousX = familiar.x;
  familiar.previousY = familiar.y;
  familiar.angle = fighter.facing;
  familiar.x = fighter.x - Math.cos(fighter.facing) * distance;
  familiar.y = fighter.y - Math.sin(fighter.facing) * distance;
}

function syncUfoHelperFamiliar(
  familiar: DefensiveFamiliarState,
  fighter: Pick<FighterState, "x" | "y">,
  frame: number,
): void {
  const orbitAngle = frame * UFO_HELPER_ROTATION_SPEED;
  familiar.active = true;
  familiar.previousX = familiar.x;
  familiar.previousY = familiar.y;
  familiar.x = fighter.x + Math.cos(orbitAngle) * UFO_HELPER_ORBIT_RADIUS;
  familiar.y = fighter.y + Math.sin(orbitAngle) * UFO_HELPER_ORBIT_RADIUS;
  familiar.angle = orbitAngle * 1.8;
}

function createDefensiveFamiliarState(params: {
  readonly id: number;
  readonly key: PlayerFighterKey;
  readonly kind: DefensiveFamiliarKind;
  readonly textureKey: DefensiveFamiliarTextureKey;
  readonly x: number;
  readonly y: number;
  readonly hitRadius: number;
  readonly hitWidth: number;
  readonly hitHeight: number;
  readonly angle: number;
}): DefensiveFamiliarState {
  return {
    id: params.id,
    key: params.key,
    mobKind: "familiar",
    kind: params.kind,
    textureKey: params.textureKey,
    x: params.x,
    y: params.y,
    previousX: params.x,
    previousY: params.y,
    hitRadius: params.hitRadius,
    hitWidth: params.hitWidth,
    hitHeight: params.hitHeight,
    waveId: 0,
    movementVariant: "static",
    form: "default",
    MaxHealth: INFINITE_FAMILIAR_HEALTH,
    CurrentHealth: INFINITE_FAMILIAR_HEALTH,
    damageTaken: 0,
    active: true,
    ageTicks: 0,
    sfxFlags: 0,
    angle: params.angle,
  };
}

export function clearsOrdinaryProjectileByDefensiveFamiliar(params: {
  readonly familiarKind: string;
  readonly projectileKind: string;
  readonly owner: FighterKey;
  readonly targetOwner: FighterKey;
  readonly projectileDamage: number;
  readonly projectileVisible: boolean;
}): boolean {
  if (
    params.familiarKind !== BACKDOOR_FAMILIAR_KIND &&
    params.familiarKind !== UFO_HELPER_FAMILIAR_KIND
  ) {
    return true;
  }
  if (params.owner === params.targetOwner) {
    return false;
  }
  return (
    params.projectileVisible &&
    params.projectileDamage > 0 &&
    (params.projectileKind === "orb" || params.projectileKind === "knife")
  );
}
