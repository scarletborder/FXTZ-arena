import type { AbilityCardDefinition, CharacterDefinition } from "@repo/content";
import { ARENA_WIDTH, DEFAULT_BOMBS, speedRankToPixelsPerTick } from "@repo/types";

import type { BattleInputState, FighterKey, FighterState, TrainingStats } from "../types";
import { applyHit, getFireCooldown } from "./combat";
import { createFighter, getCharacterAmmo, resetFighter, setCharacterAmmo, tickFighterTimers } from "./fighter";
import { createBattleAbilityCard, type BattleAbilityCard, type BattleHitContext } from "../presets/ability-cards";
import { createBattleCharacter, type BattleCharacter, type CharacterActionContext } from "../presets/characters";

export class BattleFighter {
  readonly state: FighterState;
  private readonly characters = new Map<CharacterDefinition["id"], BattleCharacter>();
  private activeBattleCard: BattleAbilityCard | undefined;
  private battleCards: BattleAbilityCard[] = [];

  constructor(
    key: FighterKey,
    primaryCharacter: CharacterDefinition,
    alternateCharacter: CharacterDefinition,
    x: number,
    y: number,
    activeCard: AbilityCardDefinition | undefined,
    cards: readonly AbilityCardDefinition[] = activeCard ? [activeCard] : [],
  ) {
    this.state = createFighter(key, primaryCharacter, alternateCharacter, x, y, activeCard, cards);
    this.activeBattleCard = activeCard ? createBattleAbilityCard(activeCard) : undefined;
    this.battleCards = cards.map((card) => createBattleAbilityCard(card));
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
    cards: readonly AbilityCardDefinition[] = activeCard ? [activeCard] : [],
  ): void {
    resetFighter(this.state, primaryCharacter, alternateCharacter, x, y, activeCard, cards);
    this.activeBattleCard = activeCard ? createBattleAbilityCard(activeCard) : undefined;
    this.battleCards = cards.map((card) => createBattleAbilityCard(card));
    this.registerCharacter(primaryCharacter);
    this.registerCharacter(alternateCharacter);
    this.applyActiveCharacter(primaryCharacter);
  }

  tickTimers(): void {
    tickFighterTimers(this.state);
  }

  cardDefinitions(): readonly AbilityCardDefinition[] {
    return this.battleCards.map((card) => card.definition);
  }

  selectActiveCharacter(alternateHeld: boolean): void {
    if (this.state.actionLockedUntil > 0 || this.state.nonFireActionLockedUntil > 0) {
      return;
    }
    const activeCharacter = alternateHeld ? this.state.alternateCharacter : this.state.primaryCharacter;
    if (this.state.activeCharacter.id !== activeCharacter.id && this.state.reloadRemaining > 0) {
      this.interruptReload();
    }
    if (this.state.activeCharacter.id !== activeCharacter.id) {
      this.applyActiveCharacter(activeCharacter);
    }
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
    let startedReload = false;
    if (reloadPressed) {
      startedReload = this.startReload();
    }

    if (startedReload || this.state.reloadRemaining <= 0) {
      this.state.ammoDisplay = this.state.ammo;
      return;
    }

    this.state.reloadRemaining -= 1;
    const reloadRatio = 1 - this.state.reloadRemaining / Math.max(1, this.state.reloadTotal);
    this.state.ammoDisplay = Math.min(this.state.ammoCapacity, this.reloadDisplayAmmo(reloadRatio));
    if (this.activeCharacter.reloadCommitPolicy === "commit_per_ammo") {
      const reloadedAmmo = this.reloadCommittedAmmo();
      this.state.ammo = reloadedAmmo;
      setCharacterAmmo(this.state, this.state.activeCharacter, reloadedAmmo);
    }
    if (this.state.reloadRemaining === 0) {
      this.state.ammo = this.state.ammoCapacity;
      this.state.ammoDisplay = this.state.ammoCapacity;
      setCharacterAmmo(this.state, this.state.activeCharacter, this.state.ammoCapacity);
      this.state.reloadCharacterId = undefined;
    }
  }

  fire(ctx: CharacterActionContext, aimX: number, aimY: number): void {
    if (this.state.actionLockedUntil > 0 || this.state.reloadRemaining > 0 || this.state.deadUntil > 0) {
      return;
    }
    if (this.state.ammo <= 0) {
      this.startReload();
      return;
    }
    if (this.state.fireCooldownUntil > 0) {
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
    this.activeBattleCard?.onUse(ctx);
  }

  onProjectileHit(params: {
    readonly owner: FighterKey;
    readonly victim: FighterState;
    readonly player: FighterState;
    readonly target: FighterState;
    readonly stats: TrainingStats;
    readonly frame: number;
    readonly damage: number;
    readonly actionContext: CharacterActionContext;
    readonly attackerCards: readonly AbilityCardDefinition[];
  }): "ignored" | "accepted" | "game-over" {
    const hitContext = this.createHitContext(params);
    this.characterFor(params.victim.primaryCharacter).onHit(hitContext);
    this.characterFor(params.victim.alternateCharacter).onHit(hitContext);
    for (const card of this.battleCards) {
      card.onHit(hitContext);
    }
    return applyHit({
      ...params,
      defaultBombs: hitContext.resolution.defaultBombs,
    });
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
    this.state.reloadTotal = battleCharacter.reloadTicksPerAmmo;
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

  private createHitContext(params: {
    readonly owner: FighterKey;
    readonly victim: FighterState;
    readonly player: FighterState;
    readonly target: FighterState;
    readonly stats: TrainingStats;
    readonly frame: number;
    readonly damage: number;
    readonly actionContext: CharacterActionContext;
    readonly attackerCards: readonly AbilityCardDefinition[];
  }): BattleHitContext {
    const attacker = params.owner === "player" ? params.player : params.target;
    return {
      ...params.actionContext,
      owner: params.owner,
      victim: params.victim,
      attacker,
      damage: params.damage,
      before: {
        victim: structuredClone(params.victim),
        attacker: structuredClone(attacker),
      },
      cards: {
        victim: this.cardDefinitions(),
        attacker: params.attackerCards,
      },
      resolution: {
        defaultBombs: DEFAULT_BOMBS,
      },
    };
  }

  private interruptReload(): void {
    const committedAmmo = this.reloadCommittedAmmo();
    this.state.ammo = committedAmmo;
    setCharacterAmmo(this.state, this.state.activeCharacter, committedAmmo);
    this.state.reloadRemaining = 0;
    this.state.reloadCharacterId = undefined;
    this.state.ammoDisplay = this.state.ammo;
  }

  private startReload(): boolean {
    if (this.state.nonFireActionLockedUntil > 0 || this.state.reloadRemaining > 0 || this.state.ammo >= this.state.ammoCapacity) {
      return false;
    }
    if (this.activeCharacter.reloadStartPolicy === "keep_current") {
      setCharacterAmmo(this.state, this.state.activeCharacter, this.state.ammo);
    }
    this.state.reloadStartedAmmo = this.reloadStartAmmo();
    this.state.reloadTotal = this.reloadTicksForMissingAmmo();
    this.state.reloadRemaining = this.state.reloadTotal;
    this.state.reloadCharacterId = this.state.activeCharacter.id;
    if (this.activeCharacter.reloadStartPolicy === "reset_to_zero") {
      this.state.ammo = 0;
      setCharacterAmmo(this.state, this.state.activeCharacter, 0);
    }
    this.state.ammoDisplay = this.state.ammo;
    return true;
  }

  private reloadDisplayAmmo(reloadRatio: number): number {
    return this.state.reloadStartedAmmo + (this.state.ammoCapacity - this.state.reloadStartedAmmo) * reloadRatio;
  }

  private reloadTicksForMissingAmmo(): number {
    const missingAmmo = this.state.ammoCapacity - this.state.reloadStartedAmmo;
    return Math.max(1, missingAmmo) * this.activeCharacter.reloadTicksPerAmmo;
  }

  private reloadStartAmmo(): number {
    return this.activeCharacter.reloadStartPolicy === "reset_to_zero" ? 0 : this.state.ammo;
  }

  private reloadCommittedAmmo(): number {
    if (this.activeCharacter.reloadCommitPolicy === "commit_per_ammo") {
      const elapsedTicks = this.state.reloadTotal - this.state.reloadRemaining;
      const committedAmmo = this.state.reloadStartedAmmo + Math.floor(elapsedTicks / this.activeCharacter.reloadTicksPerAmmo);
      return Math.min(this.state.ammoCapacity, committedAmmo);
    }
    return this.state.reloadStartedAmmo;
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
