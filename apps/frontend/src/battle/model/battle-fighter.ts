import type { AbilityCardDefinition, CharacterDefinition } from "@repo/content";
import { ARENA_WIDTH, speedRankToPixelsPerTick } from "@repo/types";

import type { BattleInputState, FighterKey, FighterState, TrainingStats } from "../types";
import { applyHit, getFireCooldown } from "./combat";
import { createFighter, getCharacterAmmo, resetFighter, setCharacterAmmo, tickFighterTimers } from "./fighter";
import { createBattleCharacter, type BattleCharacter, type CharacterActionContext } from "../presets/characters";

export class BattleFighter {
  readonly state: FighterState;
  private readonly characters = new Map<CharacterDefinition["id"], BattleCharacter>();

  constructor(
    key: FighterKey,
    primaryCharacter: CharacterDefinition,
    alternateCharacter: CharacterDefinition,
    x: number,
    y: number,
    activeCard: AbilityCardDefinition | undefined,
  ) {
    this.state = createFighter(key, primaryCharacter, alternateCharacter, x, y, activeCard);
    this.registerCharacter(primaryCharacter);
    this.registerCharacter(alternateCharacter);
    this.applyActiveCharacter(primaryCharacter);
  }

  reset(
    primaryCharacter: CharacterDefinition,
    alternateCharacter: CharacterDefinition,
    x: number,
    y: number,
    activeCard: AbilityCardDefinition | undefined,
  ): void {
    resetFighter(this.state, primaryCharacter, alternateCharacter, x, y, activeCard);
    this.registerCharacter(primaryCharacter);
    this.registerCharacter(alternateCharacter);
    this.applyActiveCharacter(primaryCharacter);
  }

  tickTimers(): void {
    tickFighterTimers(this.state);
  }

  selectActiveCharacter(alternateHeld: boolean): void {
    if (this.state.actionLockedUntil > 0 || this.state.nonFireActionLockedUntil > 0) {
      return;
    }
    const activeCharacter = alternateHeld ? this.state.alternateCharacter : this.state.primaryCharacter;
    if (this.state.activeCharacter.id !== activeCharacter.id && this.state.reloadRemaining > 0) {
      this.interruptReload();
    }
    this.applyActiveCharacter(activeCharacter);
  }

  moveBy(input: Pick<BattleInputState, "moveX" | "moveY">): void {
    if (this.state.movementLockedUntil > 0) {
      return;
    }
    const speed = speedRankToPixelsPerTick(this.state.moveSpeedOverride ?? this.activeCharacter.moveSpeed);
    this.state.x = clamp(this.state.x + input.moveX * speed, 48, ARENA_WIDTH - 48);
    this.state.y = clamp(this.state.y + input.moveY * speed, 48, 627);
  }

  handleReload(reloadPressed: boolean): void {
    if (this.state.actionLockedUntil > 0 || this.state.nonFireActionLockedUntil > 0) {
      return;
    }
    if (reloadPressed && this.state.reloadRemaining === 0 && this.state.ammo < this.state.ammoCapacity) {
      this.state.reloadRemaining = this.state.reloadTotal;
      this.state.reloadCharacterId = this.state.activeCharacter.id;
      this.state.reloadStartedAmmo = this.state.ammo;
      if (this.activeCharacter.reloadPolicy === "reset_to_zero_commit_full") {
        this.state.ammo = 0;
        setCharacterAmmo(this.state, this.state.activeCharacter, 0);
      }
      this.state.ammoDisplay = this.state.ammo;
    }

    if (this.state.reloadRemaining <= 0) {
      this.state.ammoDisplay = this.state.ammo;
      return;
    }

    const reloadRatio = 1 - this.state.reloadRemaining / Math.max(1, this.state.reloadTotal);
    const reloadedDisplayAmmo = this.reloadDisplayAmmo(reloadRatio);
    const reloadedAmmo = Math.min(this.state.ammoCapacity, Math.floor(reloadedDisplayAmmo));
    this.state.ammoDisplay = Math.min(this.state.ammoCapacity, reloadedDisplayAmmo);
    if (this.activeCharacter.reloadPolicy === "keep_partial") {
      this.state.ammo = reloadedAmmo;
      setCharacterAmmo(this.state, this.state.activeCharacter, reloadedAmmo);
    }
    this.state.reloadRemaining -= 1;
    if (this.state.reloadRemaining === 0) {
      this.state.ammo = this.state.ammoCapacity;
      this.state.ammoDisplay = this.state.ammoCapacity;
      setCharacterAmmo(this.state, this.state.activeCharacter, this.state.ammoCapacity);
      this.state.reloadCharacterId = undefined;
    }
  }

  fire(ctx: CharacterActionContext, aimX: number, aimY: number): void {
    if (this.state.actionLockedUntil > 0 || this.state.ammo <= 0 || this.state.fireCooldownUntil > 0 || this.state.deadUntil > 0) {
      return;
    }

    this.state.ammo -= 1;
    this.state.ammoDisplay = this.state.ammo;
    setCharacterAmmo(this.state, this.state.activeCharacter, this.state.ammo);
    this.state.shotsFired += 1;
    ctx.stats.shots += 1;
    this.state.fireCooldownUntil = getFireCooldown(this.activeCharacter.fireRate);
    this.activeCharacter.shoot(ctx, this.state, aimX, aimY);
  }

  useBomb(ctx: CharacterActionContext): void {
    if (this.state.actionLockedUntil > 0 || this.state.nonFireActionLockedUntil > 0 || this.state.bombs <= 0 || this.state.bombCooldownUntil > 0 || this.state.deadUntil > 0) {
      return;
    }
    this.activeCharacter.useBomb(ctx, this.state);
  }

  useActiveCard(ctx: CharacterActionContext): void {
    if (this.state.actionLockedUntil > 0 || this.state.nonFireActionLockedUntil > 0 || !this.state.activeCard || this.state.activeCardUses <= 0 || this.state.activeCardCooldownUntil > 0) {
      return;
    }

    this.state.activeCardUses -= 1;
    this.state.activeCardCooldownUntil = this.state.activeCard.cooldownTicks;
    this.activeCharacter.useActiveCard(ctx, this.state);
  }

  onProjectileHit(params: {
    readonly owner: FighterKey;
    readonly victim: FighterState;
    readonly player: FighterState;
    readonly target: FighterState;
    readonly stats: TrainingStats;
    readonly frame: number;
    readonly damage: number;
  }): "ignored" | "accepted" | "game-over" {
    return applyHit(params);
  }

  private get activeCharacter(): BattleCharacter {
    return this.characterFor(this.state.activeCharacter);
  }

  private applyActiveCharacter(character: CharacterDefinition): void {
    const battleCharacter = this.characterFor(character);
    this.state.activeCharacter = character;
    this.state.ammoCapacity = battleCharacter.ammoCapacity;
    this.state.ammo = getCharacterAmmo(this.state, character);
    this.state.ammoDisplay = this.state.ammo;
    this.state.reloadTotal = battleCharacter.reloadTicks;
  }

  private characterFor(character: CharacterDefinition): BattleCharacter {
    this.registerCharacter(character);
    const battleCharacter = this.characters.get(character.id);
    if (!battleCharacter) {
      throw new Error(`Missing battle character: ${character.id}`);
    }
    return battleCharacter;
  }

  private registerCharacter(character: CharacterDefinition): void {
    if (!this.characters.has(character.id)) {
      this.characters.set(character.id, createBattleCharacter(character));
    }
  }

  private interruptReload(): void {
    if (this.activeCharacter.reloadPolicy === "keep_partial") {
      const reloadedAmmo = Math.min(this.state.ammoCapacity, Math.floor(this.state.ammoDisplay));
      this.state.ammo = reloadedAmmo;
      setCharacterAmmo(this.state, this.state.activeCharacter, reloadedAmmo);
    } else if (this.activeCharacter.reloadPolicy === "keep_until_full") {
      this.state.ammo = this.state.reloadStartedAmmo;
      setCharacterAmmo(this.state, this.state.activeCharacter, this.state.reloadStartedAmmo);
    }
    this.state.reloadRemaining = 0;
    this.state.reloadCharacterId = undefined;
    this.state.ammoDisplay = this.state.ammo;
  }

  private reloadDisplayAmmo(reloadRatio: number): number {
    if (this.activeCharacter.reloadPolicy === "reset_to_zero_commit_full") {
      return this.state.ammoCapacity * reloadRatio;
    }
    return this.state.reloadStartedAmmo + (this.state.ammoCapacity - this.state.reloadStartedAmmo) * reloadRatio;
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
