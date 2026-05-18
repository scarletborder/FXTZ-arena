import {
  DEFAULT_MAPS,
  type BattleConfig,
  type BattleSnapshot,
  type BattleStats,
  type PlayerBattleState,
  type PlayerId,
  type ProjectileState,
  type TimerState,
} from "@repo/types";

import { PLAYER_RADIUS_UNITS } from "./constants";
import {
  AbilityCardEntity,
  FighterEntity,
  ProjectileEntity,
  type AbilityCardSerialized,
  type FighterSerialized,
  type ProjectileSerialized,
} from "./entities";
import { DeterministicHasher, stableHash } from "./hash";
import { createEmptyInput, type RaidFrameInput } from "./input";
import { PhysicsWorld, type PhysicsWorldSerialized } from "./physics-world";

export interface RaidStateSerialized {
  readonly version: 1;
  readonly frame: number;
  readonly rngState: number;
  readonly nextEntityId: number;
  readonly fighters: readonly FighterSerialized[];
  readonly projectiles: readonly ProjectileSerialized[];
  readonly abilityCards: readonly AbilityCardSerialized[];
  readonly physics: PhysicsWorldSerialized;
  readonly stats: BattleStats;
}

export class RaidState {
  frame = 0;
  rngState: number;
  nextEntityId = 1;
  readonly fighters = new Map<PlayerId, FighterEntity>();
  readonly projectiles = new Map<string, ProjectileEntity>();
  readonly abilityCards = new Map<string, AbilityCardEntity>();
  readonly physics = new PhysicsWorld();
  stats: BattleStats;

  constructor(config: BattleConfig) {
    this.rngState = config.seed >>> 0;
    this.stats = createEmptyStats(config.players.map((player) => player.playerId));
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
      this.physics.syncFighter(fighter, PLAYER_RADIUS_UNITS);

      for (const abilityCardId of player.loadout.abilityCardIds) {
        const id = `${player.playerId}:card:${abilityCardId}`;
        this.abilityCards.set(
          id,
          new AbilityCardEntity({
            id,
            ownerId: player.playerId,
            abilityCardId,
            remainingUses: abilityCardId === "spirit_strike_card" ? 3 : -1,
            cooldownRemainingTicks: 0,
          }),
        );
      }
    }
  }

  step(inputs: readonly RaidFrameInput[]): void {
    const inputsByPlayer = new Map(inputs.map((input) => [input.playerId, input]));

    for (const fighter of sortedValues(this.fighters)) {
      const input =
        inputsByPlayer.get(fighter.playerId) ??
        createEmptyInput(this.frame, fighter.playerId);
      fighter.applyInput(input);
      this.physics.applyFighterInput(fighter, input);
      fighter.tickTimers();
      this.physics.syncFighter(fighter, PLAYER_RADIUS_UNITS);
    }

    for (const card of sortedValues(this.abilityCards)) {
      card.tickTimers();
    }

    for (const projectile of sortedValues(this.projectiles)) {
      projectile.step();
      if (projectile.remainingTicks <= 0) {
        this.projectiles.delete(projectile.id);
      }
    }

    this.frame += 1;
  }

  serialize(): RaidStateSerialized {
    return {
      version: 1,
      frame: this.frame,
      rngState: this.rngState,
      nextEntityId: this.nextEntityId,
      fighters: sortedValues(this.fighters).map((fighter) => fighter.serialize()),
      projectiles: sortedValues(this.projectiles).map((projectile) =>
        projectile.serialize(),
      ),
      abilityCards: sortedValues(this.abilityCards).map((card) => card.serialize()),
      physics: this.physics.serialize(),
      stats: cloneStats(this.stats),
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
      this.projectiles.set(projectile.data.id, new ProjectileEntity(projectile.data));
    }

    for (const card of serialized.abilityCards) {
      this.abilityCards.set(card.data.id, new AbilityCardEntity(card.data));
    }

    this.physics.deserialize(serialized.physics);
  }

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

  toBattleSnapshot(): BattleSnapshot {
    return {
      frame: this.frame,
      rngState: String(this.rngState),
      players: sortedValues(this.fighters).map(fighterToSnapshot),
      projectiles: sortedValues(this.projectiles).map(projectileToSnapshot),
      effects: [],
      timers: abilityCardsToTimers(sortedValues(this.abilityCards)),
      stats: cloneStats(this.stats),
    };
  }
}

export function serializeStateToBytes(state: RaidStateSerialized): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(state));
}

export function deserializeStateFromBytes(data: Uint8Array): RaidStateSerialized {
  return JSON.parse(new TextDecoder().decode(data)) as RaidStateSerialized;
}

function sortedValues<T extends { readonly id?: string; readonly playerId?: PlayerId }>(
  map: ReadonlyMap<string, T>,
): T[] {
  return Array.from(map.values()).sort((left, right) => {
    const leftId = left.id ?? left.playerId ?? "";
    const rightId = right.id ?? right.playerId ?? "";
    return leftId.localeCompare(rightId);
  });
}

function createEmptyStats(playerIds: readonly PlayerId[]): BattleStats {
  return {
    damageByPlayerId: Object.fromEntries(
      playerIds.map((playerId) => [playerId, 0]),
    ) as Record<PlayerId, number>,
    bombsUsedByPlayerId: Object.fromEntries(
      playerIds.map((playerId) => [playerId, 0]),
    ) as Record<PlayerId, number>,
    shotsFiredByPlayerId: Object.fromEntries(
      playerIds.map((playerId) => [playerId, 0]),
    ) as Record<PlayerId, number>,
  };
}

function cloneStats(stats: BattleStats): BattleStats {
  return {
    damageByPlayerId: { ...stats.damageByPlayerId },
    bombsUsedByPlayerId: { ...stats.bombsUsedByPlayerId },
    shotsFiredByPlayerId: { ...stats.shotsFiredByPlayerId },
  };
}

function writeStatsHash(hasher: DeterministicHasher, stats: BattleStats): void {
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
    shape: {
      kind: "rect",
      width: projectile.width,
      height: projectile.height,
    },
  };
}

function abilityCardsToTimers(cards: readonly AbilityCardEntity[]): TimerState[] {
  return cards
    .filter((card) => card.cooldownRemainingTicks > 0)
    .map((card) => ({
      id: `${card.id}:cooldown`,
      targetId: card.id,
      remainingTicks: card.cooldownRemainingTicks,
    }));
}
