import { DEFAULT_MAPS } from "@repo/content";
import { getCharacterDefinition } from "@repo/content";
import {
  ARENA_HEIGHT,
  ARENA_WIDTH,
  PLAYER_RADIUS_UNITS,
  speedRankToPixelsPerTick,
  type BattleConfig,
  type BattleSnapshot,
  type BattleStats,
  type PlayerBattleState,
  type PlayerId,
  type ProjectileState,
  type TimerState,
} from "@repo/types";

/** Mutable stats used internally; converted to readonly BattleStats on output. */
interface MutableStats {
  damageByPlayerId: Record<string, number>;
  bombsUsedByPlayerId: Record<string, number>;
  shotsFiredByPlayerId: Record<string, number>;
}
import {
  AbilityCardEntity,
  FighterEntity,
  ProjectileEntity,
  type AbilityCardSerialized,
  type FighterSerialized,
  type ProjectileSerialized,
} from "../entities";
import { DeterministicHasher, stableHash } from "./hash";
import { createEmptyInput, type RaidFrameInput } from "../input";
import { PhysicsWorld, type PhysicsWorldSerialized } from "../physics-world";

// ---------------------------------------------------------------------------
// Arena boundaries (shared between entity movement & physics clamping)
// ---------------------------------------------------------------------------

const ARENA_MIN_X = -ARENA_WIDTH / 2;
const ARENA_MAX_X = ARENA_WIDTH / 2;
const ARENA_MIN_Y = -ARENA_HEIGHT / 2;
const ARENA_MAX_Y = ARENA_HEIGHT / 2;

// ---------------------------------------------------------------------------
// Serialised state shape
// ---------------------------------------------------------------------------

export interface RaidStateSerialized {
  readonly version: 2; // bumped — new Rapier-backed physics layout
  readonly frame: number;
  readonly rngState: number;
  readonly nextEntityId: number;
  readonly fighters: readonly FighterSerialized[];
  readonly projectiles: readonly ProjectileSerialized[];
  readonly abilityCards: readonly AbilityCardSerialized[];
  readonly physics: PhysicsWorldSerialized;
  readonly stats: BattleStats;
}

// ---------------------------------------------------------------------------
// RaidState — deterministic simulation state
// ---------------------------------------------------------------------------

export class RaidState {
  frame = 0;
  rngState: number;
  nextEntityId = 1;
  readonly fighters = new Map<PlayerId, FighterEntity>();
  readonly projectiles = new Map<string, ProjectileEntity>();
  readonly abilityCards = new Map<string, AbilityCardEntity>();
  readonly physics = new PhysicsWorld();
  private physicsSynced = false;
  /** Mutable internal stats; exposed as readonly BattleStats via toBattleSnapshot. */
  stats: MutableStats;

  constructor(config: BattleConfig) {
    this.rngState = config.seed >>> 0;
    this.stats = createEmptyStats(
      config.players.map((player) => player.playerId),
    );
    const map = DEFAULT_MAPS.find((item) => item.id === config.mapId);
    if (!map) {
      throw new Error(`Unknown map id: ${config.mapId}`);
    }

    for (const player of config.players) {
      const spawn =
        map.spawnPoints.find((point) => point.id === player.spawnPointId) ??
        map.spawnPoints[this.fighters.size];

      if (!spawn) {
        throw new Error(`Missing spawn point for ${player.playerId}`);
      }

      const fighter = FighterEntity.fromPlayerConfig(player, spawn);
      this.fighters.set(player.playerId, fighter);
    }

    // Physics bodies are created lazily on first step() call so that
    // Rapier initialisation can happen asynchronously at the call site.
  }

  // ------------------------------------------------------------------
  // Main tick
  // ------------------------------------------------------------------

  /** Lazily initialise physics bodies before first step. */
  private ensurePhysicsSync(): void {
    if (this.physicsSynced) return;
    this.physicsSynced = true;
    this.syncAllPhysicsBodies();
  }

  step(inputs: readonly RaidFrameInput[]): void {
    this.ensurePhysicsSync();
    const inputsByPlayer = new Map(
      inputs.map((input) => [input.playerId, input]),
    );

    // ---- Phase 1: Apply fighter inputs & update positions -----------
    for (const fighter of sortedValues(this.fighters)) {
      const input =
        inputsByPlayer.get(fighter.playerId) ??
        createEmptyInput(this.frame, fighter.playerId);

      // Update facing, ammo, reload-start, etc.
      fighter.applyInput(input);

      // Compute movement from input and apply to entity + physics body.
      this.moveFighter(fighter, input);

      // Tick per-frame cooldowns.
      fighter.tickTimers();

      // Update the physics body position after movement.
      this.syncFighterPhysics(fighter);
    }

    // ---- Phase 2: Tick card timers ---------------------------------
    for (const card of sortedValues(this.abilityCards)) {
      card.tickTimers();
    }

    // ---- Phase 3: Step projectiles & sync physics bodies -----------
    for (const projectile of sortedValues(this.projectiles)) {
      // Clear per-frame collision flag
      projectile.hitTarget = false;

      projectile.step();

      // Update or create physics body
      if (this.physics.hasBody(projectile.id)) {
        this.physics.setTranslation(projectile.id, projectile.x, projectile.y);
      } else {
        this.addProjectileBody(projectile);
      }
    }

    // ---- Phase 4: Step Rapier world (collision detection) ----------
    const collisions = this.physics.step();

    // ---- Phase 5: Dispatch collision events ------------------------
    for (const collision of collisions) {
      if (!collision.started) continue;

      const idA = this.physics.getIdByHandle(collision.sourceHandle);
      const idB = this.physics.getIdByHandle(collision.targetHandle);
      if (!idA || !idB) continue;

      const entityA: unknown =
        this.fighters.get(idA as PlayerId) ?? this.projectiles.get(idA);
      const entityB: unknown =
        this.fighters.get(idB as PlayerId) ?? this.projectiles.get(idB);

      // Projectile vs Fighter
      this.handleProjectileFighterCollision(entityA, entityB);
      this.handleProjectileFighterCollision(entityB, entityA);
    }

    // ---- Phase 6: Remove expired / hit projectiles ------------------
    for (const projectile of sortedValues(this.projectiles)) {
      if (projectile.remainingTicks <= 0 || projectile.hitTarget) {
        this.physics.removeBody(projectile.id);
        this.projectiles.delete(projectile.id);
      }
    }

    this.frame += 1;
  }

  // ------------------------------------------------------------------
  // Fighter movement (deterministic integer math)
  // ------------------------------------------------------------------

  private moveFighter(fighter: FighterEntity, input: RaidFrameInput): void {
    const activeCharacter = getCharacterDefinition(fighter.activeCharacterId);
    const speed = speedRankToPixelsPerTick(
      activeCharacter?.moveSpeed ?? "medium",
    );
    const diagonal = input.moveX !== 0 && input.moveY !== 0;
    const vx =
      input.moveX * (diagonal ? Math.trunc((speed * 707) / 1000) : speed);
    const vy =
      input.moveY * (diagonal ? Math.trunc((speed * 707) / 1000) : speed);

    fighter.vx = vx;
    fighter.vy = vy;
    fighter.x = clamp(fighter.x + vx, ARENA_MIN_X, ARENA_MAX_X);
    fighter.y = clamp(fighter.y + vy, ARENA_MIN_Y, ARENA_MAX_Y);

    // Recompute actual velocity after clamping (for external consumers)
    fighter.vx = fighter.x - (fighter.x - vx);
    fighter.vy = fighter.y - (fighter.y - vy);
  }

  // ------------------------------------------------------------------
  // Physics body management
  // ------------------------------------------------------------------

  /** Rebuild all physics bodies from logical entity state. */
  private syncAllPhysicsBodies(): void {
    this.physics.clear();

    for (const fighter of sortedValues(this.fighters)) {
      this.addFighterBody(fighter);
    }

    for (const projectile of sortedValues(this.projectiles)) {
      this.addProjectileBody(projectile);
    }
  }

  private addFighterBody(fighter: FighterEntity): void {
    // Fighter hitbox: small circle represented as a square cuboid sensor.
    // Using cuboid since Rapier ball colliders may have compatibility quirks
    // across platforms; a square of side 2*RADIUS gives a tight enough AABB.
    const r = PLAYER_RADIUS_UNITS;
    this.physics.addBody({
      id: fighter.playerId,
      kind: "fighter",
      x: fighter.x,
      y: fighter.y,
      vx: 0,
      vy: 0,
      halfWidth: r,
      halfHeight: r,
    });
  }

  private syncFighterPhysics(fighter: FighterEntity): void {
    if (this.physics.hasBody(fighter.playerId)) {
      this.physics.setTranslation(fighter.playerId, fighter.x, fighter.y);
    } else {
      this.addFighterBody(fighter);
    }
  }

  private addProjectileBody(projectile: ProjectileEntity): void {
    const halfW = Math.max(1, Math.round(projectile.width / 2));
    const halfH = Math.max(1, Math.round(projectile.height / 2));
    this.physics.addBody({
      id: projectile.id,
      kind: "projectile",
      x: projectile.x,
      y: projectile.y,
      vx: projectile.vx,
      vy: projectile.vy,
      halfWidth: halfW,
      halfHeight: halfH,
    });
  }

  // ------------------------------------------------------------------
  // Collision dispatch
  // ------------------------------------------------------------------

  private handleProjectileFighterCollision(a: unknown, b: unknown): void {
    const projectile = a instanceof ProjectileEntity ? a : null;
    const fighter = b instanceof FighterEntity ? b : null;
    if (!projectile || !fighter) return;
    if (projectile.hitTarget) return; // already resolved this frame

    // Cannot self-harm
    if (projectile.ownerId === fighter.playerId) return;

    // Invulnerable fighters ignore hits
    if (fighter.invulnerableRemainingTicks > 0) return;

    // Apply hit
    projectile.hitTarget = true;
    fighter.lives -= 1;
    fighter.invulnerableRemainingTicks = 3 * 60; // 3 seconds of invulnerability
    this.stats.damageByPlayerId[projectile.ownerId] =
      (this.stats.damageByPlayerId[projectile.ownerId] ?? 0) + 1;
    this.stats.shotsFiredByPlayerId[projectile.ownerId] =
      (this.stats.shotsFiredByPlayerId[projectile.ownerId] ?? 0) + 1;
  }

  // ------------------------------------------------------------------
  // Serialisation
  // ------------------------------------------------------------------

  serialize(): RaidStateSerialized {
    return {
      version: 2,
      frame: this.frame,
      rngState: this.rngState,
      nextEntityId: this.nextEntityId,
      fighters: sortedValues(this.fighters).map((fighter) =>
        fighter.serialize(),
      ),
      projectiles: sortedValues(this.projectiles).map((projectile) =>
        projectile.serialize(),
      ),
      abilityCards: sortedValues(this.abilityCards).map((card) =>
        card.serialize(),
      ),
      physics: this.physics.serialize(),
      stats: cloneStats(this.stats) as unknown as BattleStats,
    };
  }

  deserialize(serialized: RaidStateSerialized): void {
    this.frame = serialized.frame;
    this.rngState = serialized.rngState;
    this.nextEntityId = serialized.nextEntityId;
    this.fighters.clear();
    this.projectiles.clear();
    this.abilityCards.clear();
    this.stats = cloneStats(serialized.stats);

    for (const serializedFighter of serialized.fighters) {
      const data = serializedFighter.data;
      const fighter = new FighterEntity({
        playerId: data.playerId,
        x: data.x,
        y: data.y,
        facingAngleTicks: data.facingAngleTicks,
        primaryCharacterId: data.primaryCharacterId,
        alternateCharacterId: data.alternateCharacterId,
        lives: data.lives,
        bombs: data.bombs,
      });
      fighter.deserialize(serializedFighter);
      this.fighters.set(fighter.playerId, fighter);
    }

    for (const projectile of serialized.projectiles) {
      this.projectiles.set(
        projectile.data.id,
        new ProjectileEntity(projectile.data),
      );
    }

    for (const card of serialized.abilityCards) {
      this.abilityCards.set(card.data.id, new AbilityCardEntity(card.data));
    }

    // Physics bodies will be rebuilt lazily on the next step() call.
    this.physicsSynced = false;
  }

  // ------------------------------------------------------------------
  // Hashing
  // ------------------------------------------------------------------

  hash(): number {
    return stableHash((hasher) => {
      hasher.writeNumber(this.frame);
      hasher.writeNumber(this.rngState);
      hasher.writeNumber(this.nextEntityId);

      for (const fighter of sortedValues(this.fighters)) {
        hasher.writeString("fighter");
        fighter.hash(hasher);
      }

      for (const projectile of sortedValues(this.projectiles)) {
        hasher.writeString("projectile");
        projectile.hash(hasher);
      }

      for (const card of sortedValues(this.abilityCards)) {
        hasher.writeString("ability-card");
        card.hash(hasher);
      }

      writeStatsHash(hasher, this.stats);
    });
  }

  // ------------------------------------------------------------------
  // Battle snapshot (for external consumers — frontend rendering etc.)
  // ------------------------------------------------------------------

  toBattleSnapshot(): BattleSnapshot {
    return {
      frame: this.frame,
      rngState: String(this.rngState),
      players: sortedValues(this.fighters).map(fighterToSnapshot),
      projectiles: sortedValues(this.projectiles).map(projectileToSnapshot),
      effects: [],
      timers: abilityCardsToTimers(sortedValues(this.abilityCards)),
      stats: cloneStats(this.stats) as unknown as BattleStats,
    };
  }
}

// ---------------------------------------------------------------------------
// Public helpers
// ---------------------------------------------------------------------------

export function serializeStateToBytes(state: RaidStateSerialized): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(state));
}

export function deserializeStateFromBytes(
  data: Uint8Array,
): RaidStateSerialized {
  return JSON.parse(new TextDecoder().decode(data)) as RaidStateSerialized;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function sortedValues<
  T extends { readonly id?: string; readonly playerId?: PlayerId },
>(map: ReadonlyMap<string, T>): T[] {
  return Array.from(map.values()).sort((left, right) => {
    const leftId = left.id ?? left.playerId ?? "";
    const rightId = right.id ?? right.playerId ?? "";
    return leftId.localeCompare(rightId);
  });
}

function createEmptyStats(playerIds: readonly PlayerId[]): MutableStats {
  return {
    damageByPlayerId: Object.fromEntries(
      playerIds.map((playerId) => [playerId, 0]),
    ),
    bombsUsedByPlayerId: Object.fromEntries(
      playerIds.map((playerId) => [playerId, 0]),
    ),
    shotsFiredByPlayerId: Object.fromEntries(
      playerIds.map((playerId) => [playerId, 0]),
    ),
  };
}

function cloneStats(stats: MutableStats): MutableStats {
  return {
    damageByPlayerId: { ...stats.damageByPlayerId },
    bombsUsedByPlayerId: { ...stats.bombsUsedByPlayerId },
    shotsFiredByPlayerId: { ...stats.shotsFiredByPlayerId },
  };
}

function writeStatsHash(
  hasher: DeterministicHasher,
  stats: MutableStats,
): void {
  writeRecord(hasher, stats.damageByPlayerId);
  writeRecord(hasher, stats.bombsUsedByPlayerId);
  writeRecord(hasher, stats.shotsFiredByPlayerId);
}

function writeRecord(
  hasher: DeterministicHasher,
  record: Readonly<Record<string, number>>,
): void {
  for (const key of Object.keys(record).sort()) {
    hasher.writeString(key);
    hasher.writeNumber(record[key] ?? 0);
  }
}

function fighterToSnapshot(fighter: FighterEntity): PlayerBattleState {
  return {
    playerId: fighter.playerId,
    x: fighter.x,
    y: fighter.y,
    facingAngleTicks: fighter.facingAngleTicks,
    activeCharacterId: fighter.activeCharacterId,
    lives: fighter.lives,
    bombs: fighter.bombs,
    ammo: fighter.ammo,
    reloadRemainingTicks: fighter.reloadRemainingTicks,
    invulnerableRemainingTicks: fighter.invulnerableRemainingTicks,
    actionLockRemainingTicks: fighter.actionLockRemainingTicks,
  };
}

function projectileToSnapshot(projectile: ProjectileEntity): ProjectileState {
  return {
    id: projectile.id,
    ownerId: projectile.ownerId,
    x: projectile.x,
    y: projectile.y,
    velocityX: projectile.vx,
    velocityY: projectile.vy,
    angleTicks: projectile.angleTicks,
    remainingTicks: projectile.remainingTicks,
    couldClear: projectile.couldClear,
    shape: {
      kind: "rect",
      width: projectile.width,
      height: projectile.height,
    },
  };
}

function abilityCardsToTimers(
  cards: readonly AbilityCardEntity[],
): TimerState[] {
  return cards
    .filter((card) => card.cooldownRemainingTicks > 0)
    .map((card) => ({
      id: `${card.id}:cooldown`,
      targetId: card.id,
      remainingTicks: card.cooldownRemainingTicks,
    }));
}
