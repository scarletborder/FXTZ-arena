import { fp } from "@shaisrc/fixed-point";

import type { FighterKey, FighterState, ProjectileState } from "@repo/types";
import { fpHypotFp } from "@repo/content";
import type { ClearRingState } from "@repo/types";
import type { PhysicsBodyDef } from "../../../physics-world";
import type { BattleRules } from "../battle-rules";

export type { ClearRingState } from "@repo/types";

export interface CreateClearRingStateParams {
  readonly id: number;
  readonly owner: FighterKey;
  readonly x: number;
  readonly y: number;
  readonly radius: number;
  readonly frame: number;
  readonly duration: number;
  readonly followsOwner?: boolean;
}

export function createClearRingState(
  params: CreateClearRingStateParams,
): ClearRingState {
  return {
    id: params.id,
    owner: params.owner,
    x: params.x,
    y: params.y,
    previousX: params.x,
    previousY: params.y,
    radius: params.radius,
    expireAt: params.frame + params.duration,
    followsOwner: params.followsOwner ?? false,
  };
}

export function stepClearRings(params: {
  readonly frame: number;
  readonly clearRings: ClearRingState[];
  readonly projectiles: ProjectileState[];
  readonly fighters: Readonly<Record<FighterKey, FighterState | undefined>>;
  readonly rules?: BattleRules;
}): void {
  const activeRings: ClearRingState[] = [];
  for (const ring of params.clearRings) {
    if (params.frame >= ring.expireAt) {
      continue;
    }
    ring.previousX = ring.x;
    ring.previousY = ring.y;
    if (ring.followsOwner) {
      const owner = params.fighters[ring.owner];
      if (owner) {
        ring.x = owner.x;
        ring.y = owner.y;
      }
    }
    activeRings.push(ring);
  }

  params.clearRings.splice(0, params.clearRings.length, ...activeRings);
  if (activeRings.length === 0) {
    return;
  }

  params.projectiles.splice(
    0,
    params.projectiles.length,
    ...params.projectiles.filter(
      (projectile) =>
        !canClearProjectile(projectile) ||
        !activeRings.some(
          (ring) =>
            canRingClearProjectile(ring, projectile, params.rules) &&
            projectileIntersectsRing(projectile, ring),
        ),
    ),
  );
}

function canRingClearProjectile(
  ring: Pick<ClearRingState, "owner">,
  projectile: Pick<ProjectileState, "owner">,
  rules: BattleRules | undefined,
): boolean {
  return (
    rules?.canProjectileClearProjectile(ring.owner, projectile.owner) ??
    ring.owner !== projectile.owner
  );
}

export function clearRingToPhysicsBody(ring: ClearRingState): PhysicsBodyDef {
  return {
    id: `clear-ring:${ring.id}`,
    kind: "clear-ring",
    shape: "ball",
    x: ring.x,
    y: ring.y,
    vx: 0,
    vy: 0,
    halfWidth: ring.radius,
    halfHeight: ring.radius,
  };
}

function canClearProjectile(projectile: ProjectileState): boolean {
  return (
    projectile.couldClear &&
    (projectile.kind === "orb" ||
      projectile.kind === "knife" ||
      projectile.kind === "diamond")
  );
}

function projectileIntersectsRing(
  projectile: ProjectileState,
  ring: ClearRingState,
): boolean {
  const projectileRadius = fp.div(
    fp.fromFloat(Math.max(projectile.width, projectile.height)),
    fp.fromInt(2),
  );
  return fp.lte(
    fpHypotFp(
      fp.sub(fp.fromFloat(projectile.x), fp.fromFloat(ring.x)),
      fp.sub(fp.fromFloat(projectile.y), fp.fromFloat(ring.y)),
    ),
    fp.add(fp.fromFloat(ring.radius), projectileRadius),
  );
}
