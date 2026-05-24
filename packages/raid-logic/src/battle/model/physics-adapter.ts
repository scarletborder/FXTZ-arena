import { PhysicsWorld, ensureRapierInit, type BodyDebugData } from "../../physics-world";

import { fp } from "@shaisrc/fixed-point";

import { PLAYER_CORE_RADIUS } from "@repo/types";

import type { FighterKey, FighterState, PointState, ProjectileState, ShieldState } from "@repo/content";
import type { NeutralMobState } from "@repo/types";

/**
 * Result of a Rapier collision query — maps a projectile to the fighter
 * it overlapped.
 */
export interface CollisionResult {
  readonly projectileId: number;
  readonly victimKey?: FighterKey;
  readonly victimMobId?: number;
  readonly blockedByShield?: true;
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
  private readonly mobBodyIds = new Set<string>();
  private readonly pointBodyIds = new Set<string>();

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
    neutralMobs: readonly NeutralMobState[] = [],
    points: readonly PointState[] = [],
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
      if ((p.kind === "laser" || p.kind === "spark") && !Number.isFinite(p.width)) {
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
        halfWidth: Math.max(1, fp.toFloat(fp.div(fp.fromFloat(p.width), fp.fromInt(2)))),
        halfHeight: Math.max(1, fp.toFloat(fp.div(fp.fromFloat(p.height), fp.fromInt(2)))),
        angleRad: p.angle,
      });
      this.projBodyIds.add(bodyId);
      projectileMap.set(p.id, p);
    }

    for (const shield of shields) {
      const bodyId = `shield:${shield.owner}`;
      this.world.addBody({
        id: bodyId,
        kind: "shield",
        x: shield.x,
        y: shield.y,
        vx: 0,
        vy: 0,
        halfWidth: Math.max(1, fp.toFloat(fp.div(fp.fromFloat(shield.width), fp.fromInt(2)))),
        halfHeight: Math.max(1, fp.toFloat(fp.div(fp.fromFloat(shield.height), fp.fromInt(2)))),
        angleRad: shield.angle,
      });
      this.shieldBodyIds.add(bodyId);
    }

    // -- 3b. Add bodies for current-frame neutral mobs ----------------------
    const mobMap = new Map<number, NeutralMobState>();
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

    return results;
  }

  /** Release all Rapier resources. */
  destroy(): void {
    this.projBodyIds.clear();
    this.shieldBodyIds.clear();
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
      halfWidth: PLAYER_CORE_RADIUS, // radius for ball
      halfHeight: PLAYER_CORE_RADIUS,
    });
  }
}

// ---------------------------------------------------------------------------
// Collision resolution
// ---------------------------------------------------------------------------

function resolveCollision(
  idA: string,
  idB: string,
  projectileMap: Map<number, ProjectileState>,
  mobMap?: Map<number, NeutralMobState>,
): CollisionResult | null {
  const aIsProj = idA.startsWith("proj:");
  const bIsProj = idB.startsWith("proj:");
  if (aIsProj === bIsProj) return null; // projectile-projectile or fighter-fighter

  const projId = aIsProj ? idA : idB;
  const otherId = aIsProj ? idB : idA;
  const projectileNum = Number(projId.slice("proj:".length));

  if (!projectileMap.has(projectileNum)) return null;

  if (otherId.startsWith("shield:")) {
    const shieldOwner = otherId.slice("shield:".length);
    if (projectileMap.get(projectileNum)?.owner === shieldOwner) {
      return null;
    }
    return { projectileId: projectileNum, blockedByShield: true };
  }

  if (otherId.startsWith("mob:")) {
    const mobId = Number(otherId.slice("mob:".length));
    if (mobMap?.has(mobId)) {
      return { projectileId: projectileNum, victimKey: "Neutral", victimMobId: mobId };
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
