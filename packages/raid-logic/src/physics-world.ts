import RAPIER from "@dimforge/rapier2d-deterministic-compat";
import { ARENA_HEIGHT, ARENA_WIDTH } from "@repo/types";

const DEFAULT_MIN_X = -ARENA_WIDTH / 2;
const DEFAULT_MAX_X = ARENA_WIDTH / 2;
const DEFAULT_MIN_Y = -ARENA_HEIGHT / 2;
const DEFAULT_MAX_Y = ARENA_HEIGHT / 2;

// ---------------------------------------------------------------------------
// Module-level async initialisation
// ---------------------------------------------------------------------------

let rapierInitPromise: Promise<void> | null = null;

/**
 * Ensure the underlying Rapier WASM/asm module is loaded.
 * Safe to call multiple times from concurrent callers.
 */
export function ensureRapierInit(): Promise<void> {
  if (!rapierInitPromise) {
    rapierInitPromise = RAPIER.init().catch(() => {
      // Some bundlers auto-init Rapier; swallow redundant init errors.
    });
  }
  return rapierInitPromise;
}

// ---------------------------------------------------------------------------
// Serialisable pure-data shape descriptors
// ---------------------------------------------------------------------------

export interface PhysicsBodyDef {
  readonly id: string;
  readonly kind: "fighter" | "projectile" | "obstacle";
  readonly shape?: "cuboid" | "ball";
  readonly x: number;
  readonly y: number;
  readonly vx: number;
  readonly vy: number;
  /** For cuboid: half-width. For ball: radius. */
  readonly halfWidth: number;
  /** For cuboid: half-height. Ignored for ball. */
  readonly halfHeight: number;
  /** Rotation in radians (optional — defaults to 0). */
  readonly angleRad?: number;
}

export interface PhysicsWorldSerialized {
  readonly bodies: readonly PhysicsBodyDef[];
}

// ---------------------------------------------------------------------------
// Collision event (from Rapier event-queue drainage)
// ---------------------------------------------------------------------------

export interface CollisionEvent {
  readonly sourceHandle: number;
  readonly targetHandle: number;
  readonly started: boolean;
}

/**
 * Opaque handle → entity-id mapping.
 * Set by the simulation layer so that collision consumers can look up which
 * logical entity was involved.
 */
export type CollisionEntityMap = ReadonlyMap<number, string>;

// ---------------------------------------------------------------------------
// Debug data (for rendering collision shapes)
// ---------------------------------------------------------------------------

export interface BodyDebugData {
  readonly id: string;
  readonly kind: string;
  readonly shape: "cuboid" | "ball";
  readonly x: number;
  readonly y: number;
  readonly angleRad: number;
  readonly halfWidth: number;
  readonly halfHeight: number;
}

// ---------------------------------------------------------------------------
// PhysicsWorld — deterministic Rapier 2D wrapper
// ---------------------------------------------------------------------------

export class PhysicsWorld {
  private world: RAPIER.World | null = null;
  private eventQueue: RAPIER.EventQueue | null = null;

  /** Arena clamping bounds (instance-level, configurable). */
  private readonly minX: number;
  private readonly maxX: number;
  private readonly minY: number;
  private readonly maxY: number;

  /** Handle → rigid-body & body definition */
  private readonly bodies = new Map<string, RAPIER.RigidBody>();
  /** Handle → entity-id (for collision dispatch) */
  private readonly handleToId = new Map<number, string>();
  /** id → Rapier rigid-body handle */
  private readonly idToHandle = new Map<string, number>();
  /** id → shape discriminator (used by debug rendering) */
  private readonly bodyIsBall = new Map<string, boolean>();
  /** id → logical kind (used by debug rendering) */
  private readonly bodyKind = new Map<string, string>();

  constructor(bounds?: {
    readonly minX?: number;
    readonly maxX?: number;
    readonly minY?: number;
    readonly maxY?: number;
  }) {
    this.minX = bounds?.minX ?? DEFAULT_MIN_X;
    this.maxX = bounds?.maxX ?? DEFAULT_MAX_X;
    this.minY = bounds?.minY ?? DEFAULT_MIN_Y;
    this.maxY = bounds?.maxY ?? DEFAULT_MAX_Y;
  }

  // ------------------------------------------------------------------
  // Lifecycle
  // ------------------------------------------------------------------

  /**
   * Ensure Rapier is initialised and create a zero-gravity world.
   * Safe to call multiple times — the underlying RAPIER.init() guard
   * prevents double-initialisation.
   */
  async ensureInit(): Promise<void> {
    if (this.world) return;
    await RAPIER.init();
    this.world = new RAPIER.World({ x: 0, y: 0 });
    this.world.timestep = 1 / 60;
    this.eventQueue = new RAPIER.EventQueue(true);
  }

  /**
   * Synchronous init guard for contexts where RAPIER is already guaranteed
   * initialised (e.g. inside a tick that follows an async setup).
   */
  private ensureWorld(): void {
    if (this.world) return;
    // Rapier constructors throw if the module hasn't been loaded, but we
    // want a clear error rather than a cryptic one.
    this.world = new RAPIER.World({ x: 0, y: 0 });
    this.world.timestep = 1 / 60;
    this.eventQueue = new RAPIER.EventQueue(true);
  }

  // ------------------------------------------------------------------
  // Body management
  // ------------------------------------------------------------------

  addBody(def: PhysicsBodyDef): void {
    this.ensureWorld();
    if (this.idToHandle.has(def.id)) {
      this.removeBody(def.id);
    }

    const translation = { x: clamp(def.x, this.minX, this.maxX), y: clamp(def.y, this.minY, this.maxY) };
    const desc = RAPIER.RigidBodyDesc.kinematicVelocityBased()
      .setTranslation(translation.x, translation.y);
    if (def.angleRad !== undefined && def.angleRad !== 0) {
      desc.setRotation(def.angleRad);
    }
    const body = this.world!.createRigidBody(desc);

    const isBall = def.shape === "ball";
    const colliderDesc = isBall
      ? RAPIER.ColliderDesc.ball(def.halfWidth)
      : RAPIER.ColliderDesc.cuboid(def.halfWidth, def.halfHeight);

    colliderDesc
      .setSensor(true)
      .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS)
      .setActiveCollisionTypes(
        RAPIER.ActiveCollisionTypes.DEFAULT |
        RAPIER.ActiveCollisionTypes.KINEMATIC_KINEMATIC,
      );
    this.world!.createCollider(colliderDesc, body);

    this.bodies.set(def.id, body);
    this.idToHandle.set(def.id, body.handle);
    this.handleToId.set(body.handle, def.id);
    this.bodyIsBall.set(def.id, isBall);
    this.bodyKind.set(def.id, def.kind);

    body.setLinvel({ x: def.vx, y: def.vy }, true);
  }

  removeBody(id: string): void {
    const body = this.bodies.get(id);
    if (!body) return;

    const handle = this.idToHandle.get(id);
    if (handle !== undefined) {
      this.handleToId.delete(handle);
    }
    this.idToHandle.delete(id);
    this.bodies.delete(id);
    this.bodyIsBall.delete(id);
    this.bodyKind.delete(id);
    this.world!.removeRigidBody(body);
  }

  clear(): void {
    for (const id of Array.from(this.bodies.keys())) {
      this.removeBody(id);
    }
    this.bodyIsBall.clear();
    this.bodyKind.clear();
  }

  // ------------------------------------------------------------------
  // Position / velocity / rotation setters
  // ------------------------------------------------------------------

  setVelocity(id: string, vx: number, vy: number): void {
    const body = this.bodies.get(id);
    if (body) {
      body.setLinvel({ x: vx, y: vy }, true);
    }
  }

  setTranslation(id: string, x: number, y: number): void {
    const body = this.bodies.get(id);
    if (body) {
      // Kinematic bodies use "next" transform which is applied at the
      // next world.step() call.
      body.setNextKinematicTranslation({
        x: clamp(x, this.minX, this.maxX),
        y: clamp(y, this.minY, this.maxY),
      });
    }
  }

  setRotation(id: string, angleRad: number): void {
    const body = this.bodies.get(id);
    if (body) {
      body.setNextKinematicRotation(angleRad);
    }
  }

  // ------------------------------------------------------------------
  // Position / velocity getters (after step)
  // ------------------------------------------------------------------

  readBody(id: string): { x: number; y: number; vx: number; vy: number } | undefined {
    const body = this.bodies.get(id);
    if (!body) return undefined;

    const t = body.translation();
    const v = body.linvel();
    return { x: Math.trunc(t.x), y: Math.trunc(t.y), vx: Math.trunc(v.x), vy: Math.trunc(v.y) };
  }

  getHandle(id: string): number | undefined {
    return this.idToHandle.get(id);
  }

  getIdByHandle(handle: number): string | undefined {
    return this.handleToId.get(handle);
  }

  hasBody(id: string): boolean {
    return this.bodies.has(id);
  }

  // ------------------------------------------------------------------
  // Step
  // ------------------------------------------------------------------

  /**
   * Advance Rapier by one fixed timestep and return collision events
   * that occurred during this step.
   */
  step(): readonly CollisionEvent[] {
    this.ensureWorld();
    this.world!.step(this.eventQueue!);

    const events: CollisionEvent[] = [];
    this.eventQueue!.drainCollisionEvents((handle1, handle2, started) => {
      events.push({ sourceHandle: handle1, targetHandle: handle2, started });
    });
    return events;
  }

  // ------------------------------------------------------------------
  // Serialization (pure data, no Rapier references)
  // ------------------------------------------------------------------

  serialize(): PhysicsWorldSerialized {
    const bodies: PhysicsBodyDef[] = [];
    this.bodies.forEach((body, id) => {
      const t = body.translation();
      const v = body.linvel();
      const isBall = this.bodyIsBall.get(id) ?? false;
      const collider = body.collider(0);
      const halfWidth = isBall ? (collider?.radius() ?? 1) : (collider?.halfExtents()?.x ?? 1);
      const halfHeight = isBall ? 0 : (collider?.halfExtents()?.y ?? 1);

      bodies.push({
        id,
        kind: (this.bodyKind.get(id) ?? "obstacle") as "fighter" | "projectile" | "obstacle",
        shape: isBall ? "ball" : "cuboid",
        x: Math.trunc(t.x),
        y: Math.trunc(t.y),
        vx: Math.trunc(v.x),
        vy: Math.trunc(v.y),
        halfWidth,
        halfHeight,
        angleRad: body.rotation(),
      });
    });
    bodies.sort((a, b) => a.id.localeCompare(b.id));
    return { bodies };
  }

  /**
   * Rapier-native debug rendering — returns the raw line-segment and color
   * buffers that represent all collider shapes in the physics world.
   *
   * - `vertices`: groups of 4 float values = (x1, y1) → (x2, y2) line
   * - `colors`:   groups of 4 float values = (r, g, b, a) per vertex
   *
   * Returns `null` if the world hasn't been initialised yet.
   */
  debugRender(): { vertices: Float32Array; colors: Float32Array } | null {
    if (!this.world) return null;
    const debug = this.world.debugRender();
    return { vertices: debug.vertices, colors: debug.colors };
  }

  /**
   * Return debug data for every body in the world.
   * Used by debug rendering to visualise collision shapes.
   */
  readAllBodies(): BodyDebugData[] {
    const result: BodyDebugData[] = [];
    this.bodies.forEach((body, id) => {
      const t = body.translation();
      const isBall = this.bodyIsBall.get(id) ?? false;
      const collider = body.collider(0);
      const halfWidth = isBall ? (collider?.radius() ?? 1) : (collider?.halfExtents()?.x ?? 1);
      const halfHeight = isBall ? 0 : (collider?.halfExtents()?.y ?? 1);

      result.push({
        id,
        kind: this.bodyKind.get(id) ?? "unknown",
        shape: isBall ? "ball" : "cuboid",
        x: t.x,
        y: t.y,
        angleRad: body.rotation(),
        halfWidth,
        halfHeight,
      });
    });
    return result;
  }

  deserialize(data: PhysicsWorldSerialized): void {
    this.clear();
    // Don't re-init; world already exists after clear.
    for (const def of data.bodies) {
      this.addBody(def);
    }
  }

  /**
   * Replace the entire world with a fresh one (used after rollback).
   * Equivalent to clear() + deserialize() but avoids stale state.
   */
  resetFromSerialized(data: PhysicsWorldSerialized): void {
    this.clear();
    this.ensureWorld();
    for (const def of data.bodies) {
      this.addBody(def);
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
