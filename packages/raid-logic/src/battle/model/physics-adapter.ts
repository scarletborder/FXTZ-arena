import {
  PhysicsWorld,
  ensureRapierInit,
  type BodyDebugData,
} from "../../physics-world";

import { fp } from "@shaisrc/fixed-point";

import {
  DEFAULT_ARENA_BOUNDS,
  GRAZE_CIRCLE_DIAMETER,
  PLAYER_CORE_RADIUS,
  type ArenaBounds,
} from "@repo/types";

import type {
  FighterKey,
  FighterState,
  PointState,
  ProjectileState,
  ShieldState,
} from "@repo/content";
import type { MobState } from "@repo/types";

/**
 * Result of a Rapier collision query — maps a projectile to the fighter
 * it overlapped.
 */
export interface CollisionResult {
  readonly projectileId: number;
  readonly victimKey?: FighterKey;
  readonly victimMobId?: number;
  readonly grazedByKey?: FighterKey;
  readonly blockedByShield?: true;
  readonly blockedByShieldOwner?: FighterKey;
}

/**
 * Rapier-based collision detection layer for BattleModel.
 *
 * When enabled, this adapter replaces the manual rotated-rect/circle
 * hit-testing in the projectile system with Rapier 2D sensor-collider
 * overlap detection.
 *
 * Infinite-width beams (laser/spark with non-finite width) are skipped
 * and must fall back to the manual hit-test path.
 */
export class BattlePhysics {
  private world: PhysicsWorld | null = null;
  private ready = false;
  /** Track projectile body IDs added this frame so we can remove them. */
  private readonly projBodyIds = new Set<string>();
  private readonly shieldBodyIds = new Set<string>();
  private readonly grazeBodyIds = new Set<string>();
  private readonly mobBodyIds = new Set<string>();
  private readonly pointBodyIds = new Set<string>();

  constructor(
    private readonly arenaBounds: ArenaBounds = DEFAULT_ARENA_BOUNDS,
  ) {}

  async init(): Promise<void> {
    await ensureRapierInit();
    this.world = new PhysicsWorld({
      // Frontend uses screen-space coordinates — no clamping needed since
      // BattleFighter already clamps within the arena.
      minX: -Infinity,
      maxX: Infinity,
      minY: -Infinity,
      maxY: Infinity,
    });
    await this.world.ensureInit();
    this.ready = true;
  }

  isReady(): boolean {
    return this.ready;
  }

  /**
   * Step Rapier and return which projectiles hit which fighter this frame.
   *
   * Call AFTER projectile positions have been updated but BEFORE the
   * `stepProjectiles` filter runs, so the caller can use these results
   * to determine which projectiles hit.
   *
   * Projectiles with non-finite width (infinite beams) are excluded —
   * they should use the manual hit-test path.
   */
  computeCollisions(
    projectiles: readonly ProjectileState[],
    player: FighterState,
    target: FighterState,
    shields: readonly ShieldState[] = [],
    neutralMobs: readonly MobState[] = [],
    points: readonly PointState[] = [],
    grazeRadiusMultipliers: Readonly<Record<"Player1" | "Player2", number>> = {
      Player1: 1,
      Player2: 1,
    },
  ): CollisionResult[] {
    if (!this.ready || !this.world) return [];

    // -- 1. Ensure fighter bodies exist and positions are current ----------
    this.syncFighter("Player1", player);
    this.syncFighter("Player2", target);

    // -- 2. Remove previous frame's projectile / shield / mob bodies -------
    for (const id of Array.from(this.projBodyIds)) {
      this.world.removeBody(id);
    }
    this.projBodyIds.clear();
    for (const id of Array.from(this.shieldBodyIds)) {
      this.world.removeBody(id);
    }
    this.shieldBodyIds.clear();
    for (const id of Array.from(this.grazeBodyIds)) {
      this.world.removeBody(id);
    }
    this.grazeBodyIds.clear();
    for (const id of Array.from(this.mobBodyIds)) {
      this.world.removeBody(id);
    }
    this.mobBodyIds.clear();
    for (const id of Array.from(this.pointBodyIds)) {
      this.world.removeBody(id);
    }
    this.pointBodyIds.clear();

    // -- 3. Add bodies for current-frame projectiles -----------------------
    const projectileMap = new Map<number, ProjectileState>();
    for (const p of projectiles) {
      // Skip infinite-width beams — Rapier can't represent them.
      if (
        (p.kind === "laser" || p.kind === "spark") &&
        !Number.isFinite(p.width)
      ) {
        const bodyId = `proj-graze:${p.id}`;
        const length =
          Math.hypot(this.arenaBounds.width, this.arenaBounds.height) * 2;
        this.world.addBody({
          id: bodyId,
          kind: "projectile",
          x: p.x + Math.cos(p.angle) * (length / 2),
          y: p.y + Math.sin(p.angle) * (length / 2),
          vx: 0,
          vy: 0,
          halfWidth: length / 2,
          halfHeight: Math.max(
            1,
            fp.toFloat(fp.div(fp.fromFloat(p.height), fp.fromInt(2))),
          ),
          angleRad: p.angle,
        });
        this.projBodyIds.add(bodyId);
        projectileMap.set(p.id, p);
        continue;
      }
      const bodyId = `proj:${p.id}`;
      if (p.width <= 0 || p.height <= 0) continue;
      this.world.addBody({
        id: bodyId,
        kind: "projectile",
        x: p.x,
        y: p.y,
        vx: 0,
        vy: 0,
        halfWidth: Math.max(
          1,
          fp.toFloat(fp.div(fp.fromFloat(p.width), fp.fromInt(2))),
        ),
        halfHeight: Math.max(
          1,
          fp.toFloat(fp.div(fp.fromFloat(p.height), fp.fromInt(2))),
        ),
        angleRad: p.angle,
      });
      this.projBodyIds.add(bodyId);
      projectileMap.set(p.id, p);
    }

    for (const shield of shields) {
      const bodyId = `shield:${shield.owner}:${shield.id}`;
      this.world.addBody({
        id: bodyId,
        kind: "shield",
        x: shield.x,
        y: shield.y,
        vx: 0,
        vy: 0,
        halfWidth: Math.max(
          1,
          fp.toFloat(fp.div(fp.fromFloat(shield.width), fp.fromInt(2))),
        ),
        halfHeight: Math.max(
          1,
          fp.toFloat(fp.div(fp.fromFloat(shield.height), fp.fromInt(2))),
        ),
        angleRad: shield.angle,
      });
      this.shieldBodyIds.add(bodyId);
    }

    this.syncGrazeCircle("Player1", player, grazeRadiusMultipliers.Player1);
    this.syncGrazeCircle("Player2", target, grazeRadiusMultipliers.Player2);

    // -- 3b. Add bodies for current-frame neutral mobs ----------------------
    const mobMap = new Map<number, MobState>();
    for (const mob of neutralMobs) {
      if (!mob.active) continue;
      const bodyId = `mob:${mob.id}`;
      this.world.addBody({
        id: bodyId,
        kind: "obstacle",
        x: mob.x,
        y: mob.y,
        vx: 0,
        vy: 0,
        halfWidth: Math.max(1, (mob.hitWidth ?? 16) / 2),
        halfHeight: Math.max(1, (mob.hitHeight ?? 24) / 2),
      });
      this.mobBodyIds.add(bodyId);
      mobMap.set(mob.id, mob);
    }

    // -- 3c. Add bodies for current-frame point pickups ---------------------
    this.syncPointBodies(points);

    // -- 4. Step Rapier and drain collision events ------------------------
    const events = this.world.step();
    const results: CollisionResult[] = [];

    for (const event of events) {
      if (!event.started) continue;

      const idA = this.world.getIdByHandle(event.sourceHandle);
      const idB = this.world.getIdByHandle(event.targetHandle);
      if (!idA || !idB) continue;

      const match = resolveCollision(idA, idB, projectileMap, mobMap);
      if (match) {
        results.push(match);
      }
    }

    const hitKeysByProjectile = new Map<number, Set<FighterKey>>();
    for (const result of results) {
      if (!result.victimKey || result.victimKey === "Neutral") {
        continue;
      }
      const hitKeys = hitKeysByProjectile.get(result.projectileId) ?? new Set();
      hitKeys.add(result.victimKey);
      hitKeysByProjectile.set(result.projectileId, hitKeys);
    }

    return results.filter((result) => {
      if (!result.grazedByKey) {
        return true;
      }
      return !hitKeysByProjectile
        .get(result.projectileId)
        ?.has(result.grazedByKey);
    });
  }

  /** Release all Rapier resources. */
  destroy(): void {
    this.projBodyIds.clear();
    this.shieldBodyIds.clear();
    this.grazeBodyIds.clear();
    this.mobBodyIds.clear();
    this.pointBodyIds.clear();
    this.world?.clear();
    this.world = null;
    this.ready = false;
  }

  /** Clear transient Rapier bodies after a logic rollback/reset. */
  reset(): void {
    this.projBodyIds.clear();
    this.shieldBodyIds.clear();
    this.grazeBodyIds.clear();
    this.mobBodyIds.clear();
    this.pointBodyIds.clear();
    this.world?.resetEmpty();
  }

  // ------------------------------------------------------------------
  // Private helpers
  // ------------------------------------------------------------------

  /** Get all collision bodies for debug rendering. */
  readAllBodies(): BodyDebugData[] {
    return this.world?.readAllBodies() ?? [];
  }

  /** Rapier-native debug render output. */
  debugRender(): { vertices: Float32Array; colors: Float32Array } | null {
    return this.world?.debugRender() ?? null;
  }

  syncPointBodies(points: readonly PointState[]): void {
    if (!this.ready || !this.world) return;
    for (const id of Array.from(this.pointBodyIds)) {
      this.world.removeBody(id);
    }
    this.pointBodyIds.clear();
    for (const point of points) {
      if (!point.active || point.collectingBy) continue;
      const bodyId = `point:${point.id}`;
      this.world.addBody({
        id: bodyId,
        kind: "point",
        x: point.x,
        y: point.y,
        vx: 0,
        vy: 0,
        halfWidth: Math.max(1, point.size / 2),
        halfHeight: Math.max(1, point.size / 2),
      });
      this.pointBodyIds.add(bodyId);
    }
  }

  private syncFighter(key: "Player1" | "Player2", fighter: FighterState): void {
    const bodyId = `fighter:${key}`;
    // Remove and re-add every frame so body.translation() is always exact
    // without depending on Rapier's world.step() to apply a kinematic move.
    if (this.world!.hasBody(bodyId)) {
      this.world!.removeBody(bodyId);
    }
    this.world!.addBody({
      id: bodyId,
      kind: "fighter",
      shape: "ball",
      x: fighter.x,
      y: fighter.y,
      vx: 0,
      vy: 0,
      halfWidth: PLAYER_CORE_RADIUS * fighter.hitCircleRadiusMultiplier,
      halfHeight: PLAYER_CORE_RADIUS * fighter.hitCircleRadiusMultiplier,
    });
  }

  private syncGrazeCircle(
    key: "Player1" | "Player2",
    fighter: FighterState,
    radiusMultiplier: number,
  ): void {
    const bodyId = `graze:${key}`;
    if (this.world!.hasBody(bodyId)) {
      this.world!.removeBody(bodyId);
    }
    this.world!.addBody({
      id: bodyId,
      kind: "graze",
      shape: "ball",
      x: fighter.x,
      y: fighter.y,
      vx: 0,
      vy: 0,
      halfWidth: (GRAZE_CIRCLE_DIAMETER / 2) * radiusMultiplier,
      halfHeight: (GRAZE_CIRCLE_DIAMETER / 2) * radiusMultiplier,
    });
    this.grazeBodyIds.add(bodyId);
  }
}

// ---------------------------------------------------------------------------
// Collision resolution
// ---------------------------------------------------------------------------

function resolveCollision(
  idA: string,
  idB: string,
  projectileMap: Map<number, ProjectileState>,
  mobMap?: Map<number, MobState>,
): CollisionResult | null {
  const projectileA = parseProjectileCollisionId(idA);
  const projectileB = parseProjectileCollisionId(idB);
  const aIsProj = projectileA !== undefined;
  const bIsProj = projectileB !== undefined;
  if (aIsProj === bIsProj) return null; // projectile-projectile or fighter-fighter

  const projectileCollision = aIsProj ? projectileA! : projectileB!;
  const otherId = aIsProj ? idB : idA;
  const projectileNum = projectileCollision.id;

  if (!projectileMap.has(projectileNum)) return null;

  if (projectileCollision.grazeOnly) {
    if (!otherId.startsWith("graze:")) {
      return null;
    }
    const grazedByKey = otherId.slice("graze:".length) as FighterKey;
    if (projectileMap.get(projectileNum)?.owner === grazedByKey) {
      return null;
    }
    return { projectileId: projectileNum, grazedByKey };
  }

  if (otherId.startsWith("shield:")) {
    const shieldOwner = parseShieldOwnerFromCollisionId(otherId);
    if (!shieldOwner) {
      return null;
    }
    if (projectileMap.get(projectileNum)?.owner === shieldOwner) {
      return null;
    }
    return {
      projectileId: projectileNum,
      blockedByShield: true,
      blockedByShieldOwner: shieldOwner as FighterKey,
    };
  }

  if (otherId.startsWith("graze:")) {
    const grazedByKey = otherId.slice("graze:".length) as FighterKey;
    if (projectileMap.get(projectileNum)?.owner === grazedByKey) {
      return null;
    }
    return { projectileId: projectileNum, grazedByKey };
  }

  if (otherId.startsWith("mob:")) {
    const mobId = Number(otherId.slice("mob:".length));
    const mob = mobMap?.get(mobId);
    if (mob) {
      return {
        projectileId: projectileNum,
        victimKey: mob.key,
        victimMobId: mobId,
      };
    }
    return null;
  }

  if (otherId.startsWith("point:")) {
    return null;
  }

  const victimKey = otherId === "fighter:Player1" ? "Player1" : "Player2";
  if (projectileMap.get(projectileNum)?.owner === victimKey) {
    return null;
  }
  return { projectileId: projectileNum, victimKey };
}

function parseProjectileCollisionId(
  id: string,
): { readonly id: number; readonly grazeOnly: boolean } | undefined {
  if (id.startsWith("proj-graze:")) {
    return {
      id: Number(id.slice("proj-graze:".length)),
      grazeOnly: true,
    };
  }
  if (id.startsWith("proj:")) {
    return {
      id: Number(id.slice("proj:".length)),
      grazeOnly: false,
    };
  }
  return undefined;
}

function parseShieldOwnerFromCollisionId(id: string): FighterKey | undefined {
  const parts = id.split(":");
  if (parts.length < 3 || parts[0] !== "shield") {
    return undefined;
  }
  const owner = parts[1];
  if (owner === "Player1" || owner === "Player2" || owner === "Neutral") {
    return owner;
  }
  return undefined;
}
