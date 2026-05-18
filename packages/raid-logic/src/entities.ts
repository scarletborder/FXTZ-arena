import {
  DEFAULT_CHARACTERS,
  getDefaultBombs,
  getInitialLives,
  type AbilityCardId,
  type BattlePlayerConfig,
  type CharacterId,
  type PlayerId,
} from "@repo/types";

import { DeterministicHasher } from "./hash";
import type { RaidFrameInput } from "./input";

export interface SerializedEntity {
  readonly kind: string;
  readonly data: Record<string, number | string>;
}

export interface SerializableEntity<TSerialized extends SerializedEntity> {
  serialize(): TSerialized;
  deserialize(serialized: TSerialized): void;
  hash(hasher: DeterministicHasher): void;
}

export interface FighterSerialized extends SerializedEntity {
  readonly kind: "fighter";
  readonly data: {
    readonly playerId: PlayerId;
    readonly x: number;
    readonly y: number;
    readonly vx: number;
    readonly vy: number;
    readonly facingAngleTicks: number;
    readonly primaryCharacterId: CharacterId;
    readonly alternateCharacterId: CharacterId;
    readonly activeCharacterId: CharacterId;
    readonly lives: number;
    readonly bombs: number;
    readonly ammo: number;
    readonly ammoCapacity: number;
    readonly reloadRemainingTicks: number;
    readonly reloadTotalTicks: number;
    readonly invulnerableRemainingTicks: number;
    readonly actionLockRemainingTicks: number;
    readonly infoHeld: number;
  };
}

export class FighterEntity
  implements SerializableEntity<FighterSerialized>
{
  playerId: PlayerId;
  x: number;
  y: number;
  vx = 0;
  vy = 0;
  facingAngleTicks: number;
  primaryCharacterId: CharacterId;
  alternateCharacterId: CharacterId;
  activeCharacterId: CharacterId;
  lives: number;
  bombs: number;
  ammo: number;
  ammoCapacity: number;
  reloadRemainingTicks = 0;
  reloadTotalTicks = 0;
  invulnerableRemainingTicks = 0;
  actionLockRemainingTicks = 0;
  infoHeld = false;

  constructor(config: {
    readonly playerId: PlayerId;
    readonly x: number;
    readonly y: number;
    readonly facingAngleTicks: number;
    readonly primaryCharacterId: CharacterId;
    readonly alternateCharacterId: CharacterId;
    readonly lives: number;
    readonly bombs: number;
  }) {
    const definition = getCharacterDefinitionOrThrow(config.primaryCharacterId);
    this.playerId = config.playerId;
    this.x = config.x;
    this.y = config.y;
    this.facingAngleTicks = config.facingAngleTicks;
    this.primaryCharacterId = config.primaryCharacterId;
    this.alternateCharacterId = config.alternateCharacterId;
    this.activeCharacterId = config.primaryCharacterId;
    this.lives = config.lives;
    this.bombs = config.bombs;
    this.ammoCapacity = definition.ammoCapacity;
    this.ammo = definition.ammoCapacity;
    this.reloadTotalTicks = definition.reloadTicks;
  }

  static fromPlayerConfig(
    player: BattlePlayerConfig,
    spawn: { readonly x: number; readonly y: number; readonly facingAngleTicks: number },
  ): FighterEntity {
    return new FighterEntity({
      playerId: player.playerId,
      x: Math.trunc(spawn.x),
      y: Math.trunc(spawn.y),
      facingAngleTicks: Math.trunc(spawn.facingAngleTicks),
      primaryCharacterId: player.loadout.primaryCharacterId,
      alternateCharacterId: player.loadout.alternateCharacterId,
      lives: getInitialLives(player.loadout),
      bombs: getDefaultBombs(player.loadout),
    });
  }

  applyInput(input: RaidFrameInput): void {
    this.facingAngleTicks = input.aimAngleTicks;
    this.infoHeld = input.infoHeld;

    this.activeCharacterId = input.alternateHeld
      ? this.alternateCharacterId
      : this.primaryCharacterId;

    const definition = getCharacterDefinitionOrThrow(this.activeCharacterId);
    this.ammoCapacity = definition.ammoCapacity;

    if (this.ammo > this.ammoCapacity) {
      this.ammo = this.ammoCapacity;
    }

    if (input.reloadPressed && this.reloadRemainingTicks === 0 && this.ammo < this.ammoCapacity) {
      this.ammo = 0;
      this.reloadTotalTicks = definition.reloadTicks;
      this.reloadRemainingTicks = definition.reloadTicks;
    }

    if (input.shootPressed && this.reloadRemainingTicks === 0 && this.ammo > 0) {
      this.ammo -= 1;
    }

    if (input.bombPressed && this.bombs > 0 && this.actionLockRemainingTicks === 0) {
      this.bombs -= 1;
      this.invulnerableRemainingTicks = Math.max(this.invulnerableRemainingTicks, 120);
    }
  }

  tickTimers(): void {
    if (this.reloadRemainingTicks > 0) {
      this.reloadRemainingTicks -= 1;
      if (this.reloadRemainingTicks === 0) {
        this.ammo = this.ammoCapacity;
      }
    }

    if (this.invulnerableRemainingTicks > 0) {
      this.invulnerableRemainingTicks -= 1;
    }

    if (this.actionLockRemainingTicks > 0) {
      this.actionLockRemainingTicks -= 1;
    }
  }

  serialize(): FighterSerialized {
    return {
      kind: "fighter",
      data: {
        playerId: this.playerId,
        x: this.x,
        y: this.y,
        vx: this.vx,
        vy: this.vy,
        facingAngleTicks: this.facingAngleTicks,
        primaryCharacterId: this.primaryCharacterId,
        alternateCharacterId: this.alternateCharacterId,
        activeCharacterId: this.activeCharacterId,
        lives: this.lives,
        bombs: this.bombs,
        ammo: this.ammo,
        ammoCapacity: this.ammoCapacity,
        reloadRemainingTicks: this.reloadRemainingTicks,
        reloadTotalTicks: this.reloadTotalTicks,
        invulnerableRemainingTicks: this.invulnerableRemainingTicks,
        actionLockRemainingTicks: this.actionLockRemainingTicks,
        infoHeld: this.infoHeld ? 1 : 0,
      },
    };
  }

  deserialize(serialized: FighterSerialized): void {
    const data = serialized.data;
    this.playerId = data.playerId;
    this.x = data.x;
    this.y = data.y;
    this.vx = data.vx;
    this.vy = data.vy;
    this.facingAngleTicks = data.facingAngleTicks;
    this.primaryCharacterId = data.primaryCharacterId;
    this.alternateCharacterId = data.alternateCharacterId;
    this.activeCharacterId = data.activeCharacterId;
    this.lives = data.lives;
    this.bombs = data.bombs;
    this.ammo = data.ammo;
    this.ammoCapacity = data.ammoCapacity;
    this.reloadRemainingTicks = data.reloadRemainingTicks;
    this.reloadTotalTicks = data.reloadTotalTicks;
    this.invulnerableRemainingTicks = data.invulnerableRemainingTicks;
    this.actionLockRemainingTicks = data.actionLockRemainingTicks;
    this.infoHeld = data.infoHeld === 1;
  }

  hash(hasher: DeterministicHasher): void {
    const data = this.serialize().data;
    hasher.writeString(data.playerId);
    hasher.writeNumber(data.x);
    hasher.writeNumber(data.y);
    hasher.writeNumber(data.vx);
    hasher.writeNumber(data.vy);
    hasher.writeNumber(data.facingAngleTicks);
    hasher.writeString(data.primaryCharacterId);
    hasher.writeString(data.alternateCharacterId);
    hasher.writeString(data.activeCharacterId);
    hasher.writeNumber(data.lives);
    hasher.writeNumber(data.bombs);
    hasher.writeNumber(data.ammo);
    hasher.writeNumber(data.ammoCapacity);
    hasher.writeNumber(data.reloadRemainingTicks);
    hasher.writeNumber(data.reloadTotalTicks);
    hasher.writeNumber(data.invulnerableRemainingTicks);
    hasher.writeNumber(data.actionLockRemainingTicks);
    hasher.writeNumber(data.infoHeld);
  }
}

export interface ProjectileSerialized extends SerializedEntity {
  readonly kind: "projectile";
  readonly data: {
    readonly id: string;
    readonly ownerId: PlayerId;
    readonly x: number;
    readonly y: number;
    readonly vx: number;
    readonly vy: number;
    readonly angleTicks: number;
    readonly remainingTicks: number;
    readonly width: number;
    readonly height: number;
  };
}

export class ProjectileEntity
  implements SerializableEntity<ProjectileSerialized>
{
  id: string;
  ownerId: PlayerId;
  x: number;
  y: number;
  vx: number;
  vy: number;
  angleTicks: number;
  remainingTicks: number;
  width: number;
  height: number;

  constructor(serialized: ProjectileSerialized["data"]) {
    this.id = serialized.id;
    this.ownerId = serialized.ownerId;
    this.x = serialized.x;
    this.y = serialized.y;
    this.vx = serialized.vx;
    this.vy = serialized.vy;
    this.angleTicks = serialized.angleTicks;
    this.remainingTicks = serialized.remainingTicks;
    this.width = serialized.width;
    this.height = serialized.height;
  }

  step(): void {
    this.x += this.vx;
    this.y += this.vy;
    this.remainingTicks -= 1;
  }

  serialize(): ProjectileSerialized {
    return {
      kind: "projectile",
      data: {
        id: this.id,
        ownerId: this.ownerId,
        x: this.x,
        y: this.y,
        vx: this.vx,
        vy: this.vy,
        angleTicks: this.angleTicks,
        remainingTicks: this.remainingTicks,
        width: this.width,
        height: this.height,
      },
    };
  }

  deserialize(serialized: ProjectileSerialized): void {
    Object.assign(this, serialized.data);
  }

  hash(hasher: DeterministicHasher): void {
    const data = this.serialize().data;
    hasher.writeString(data.id);
    hasher.writeString(data.ownerId);
    hasher.writeNumber(data.x);
    hasher.writeNumber(data.y);
    hasher.writeNumber(data.vx);
    hasher.writeNumber(data.vy);
    hasher.writeNumber(data.angleTicks);
    hasher.writeNumber(data.remainingTicks);
    hasher.writeNumber(data.width);
    hasher.writeNumber(data.height);
  }
}

export interface AbilityCardSerialized extends SerializedEntity {
  readonly kind: "ability-card";
  readonly data: {
    readonly id: string;
    readonly ownerId: PlayerId;
    readonly abilityCardId: AbilityCardId;
    readonly remainingUses: number;
    readonly cooldownRemainingTicks: number;
  };
}

export class AbilityCardEntity
  implements SerializableEntity<AbilityCardSerialized>
{
  id: string;
  ownerId: PlayerId;
  abilityCardId: AbilityCardId;
  remainingUses: number;
  cooldownRemainingTicks: number;

  constructor(serialized: AbilityCardSerialized["data"]) {
    this.id = serialized.id;
    this.ownerId = serialized.ownerId;
    this.abilityCardId = serialized.abilityCardId;
    this.remainingUses = serialized.remainingUses;
    this.cooldownRemainingTicks = serialized.cooldownRemainingTicks;
  }

  tickTimers(): void {
    if (this.cooldownRemainingTicks > 0) {
      this.cooldownRemainingTicks -= 1;
    }
  }

  serialize(): AbilityCardSerialized {
    return {
      kind: "ability-card",
      data: {
        id: this.id,
        ownerId: this.ownerId,
        abilityCardId: this.abilityCardId,
        remainingUses: this.remainingUses,
        cooldownRemainingTicks: this.cooldownRemainingTicks,
      },
    };
  }

  deserialize(serialized: AbilityCardSerialized): void {
    this.id = serialized.data.id;
    this.ownerId = serialized.data.ownerId;
    this.abilityCardId = serialized.data.abilityCardId;
    this.remainingUses = serialized.data.remainingUses;
    this.cooldownRemainingTicks = serialized.data.cooldownRemainingTicks;
  }

  hash(hasher: DeterministicHasher): void {
    const data = this.serialize().data;
    hasher.writeString(data.id);
    hasher.writeString(data.ownerId);
    hasher.writeString(data.abilityCardId);
    hasher.writeNumber(data.remainingUses);
    hasher.writeNumber(data.cooldownRemainingTicks);
  }
}

function getCharacterDefinitionOrThrow(id: CharacterId) {
  const definition = DEFAULT_CHARACTERS.find((character) => character.id === id);
  if (!definition) {
    throw new Error(`Unknown character id: ${id}`);
  }

  return definition;
}
