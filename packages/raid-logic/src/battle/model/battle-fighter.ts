import { fp } from "@shaisrc/fixed-point";

import type { AbilityCardDefinition, CharacterDefinition } from "@repo/content";
import {
  DEFAULT_ARENA_BOUNDS,
  DEFAULT_BOMBS,
  PLAYER_CORE_RADIUS,
  speedRankToPixelsPerTick,
  type ArenaBounds,
} from "@repo/types";

import type { BattleInputState } from "@repo/types";
import type { StoryModeOverride } from "../loadout";
import type {
  FighterKey,
  FighterState,
  ShieldState,
  TrainingStats,
} from "@repo/content";
import { applyHit, getFireCooldown } from "./combat";
import {
  createFighter,
  getCharacterAmmo,
  resetFighter,
  setCharacterAmmo,
  tickFighterTimers,
} from "./fighter";
import {
  applyInitialCardState,
  createBattleAbilityCard,
  type BattleAbilityCard,
  type BattleHitContext,
} from "@repo/content";
import {
  createBattleCharacter,
  REISEN_SHIELD_MOVE_SPEED,
  type BattleCharacter,
  type CharacterActionContext,
} from "@repo/content";
import { fpClamp, fpMax, fpMin } from "@repo/content";

export class BattleFighter {
  readonly state: FighterState;
  private readonly characters = new Map<
    CharacterDefinition["id"],
    BattleCharacter
  >();
  private activeBattleCard: BattleAbilityCard | undefined;
  private battleCards: BattleAbilityCard[] = [];
  private storyModeOverride: StoryModeOverride | undefined;
  private reviveBombsBase = DEFAULT_BOMBS;

  constructor(
    key: FighterKey,
    primaryCharacter: CharacterDefinition,
    alternateCharacter: CharacterDefinition,
    x: number,
    y: number,
    activeCard: AbilityCardDefinition | undefined,
    cards: readonly AbilityCardDefinition[] = activeCard ? [activeCard] : [],
    storyModeOverride?: StoryModeOverride,
    private readonly arenaBounds: ArenaBounds = DEFAULT_ARENA_BOUNDS,
  ) {
    this.storyModeOverride = storyModeOverride;
    const normalizedCards = normalizeAbilityCards(cards, activeCard);
    this.state = createFighter(
      key,
      primaryCharacter,
      alternateCharacter,
      x,
      y,
      activeCard,
      normalizedCards,
    );
    this.activeBattleCard = activeCard
      ? createBattleAbilityCard(activeCard)
      : undefined;
    this.battleCards = normalizedCards.map((card) =>
      createBattleAbilityCard(card),
    );
    this.registerCharacter(primaryCharacter);
    this.registerCharacter(alternateCharacter);
    applyInitialCardState(this.state, this.battleCards, {
      storyMode: storyModeOverride?.enabled === true,
      lives: storyModeOverride?.lives,
      bombs: storyModeOverride?.bombs,
    });
    this.reviveBombsBase = this.state.bombs;
    this.applyActiveCharacter(primaryCharacter);
  }

  reset(
    primaryCharacter: CharacterDefinition,
    alternateCharacter: CharacterDefinition,
    x: number,
    y: number,
    activeCard: AbilityCardDefinition | undefined,
    cards: readonly AbilityCardDefinition[] = activeCard ? [activeCard] : [],
    storyModeOverride?: StoryModeOverride,
  ): void {
    this.storyModeOverride = storyModeOverride;
    const normalizedCards = normalizeAbilityCards(cards, activeCard);
    resetFighter(
      this.state,
      primaryCharacter,
      alternateCharacter,
      x,
      y,
      activeCard,
      normalizedCards,
    );
    this.activeBattleCard = activeCard
      ? createBattleAbilityCard(activeCard)
      : undefined;
    this.battleCards = normalizedCards.map((card) =>
      createBattleAbilityCard(card),
    );
    this.registerCharacter(primaryCharacter);
    this.registerCharacter(alternateCharacter);
    applyInitialCardState(this.state, this.battleCards, {
      storyMode: storyModeOverride?.enabled === true,
      lives: storyModeOverride?.lives,
      bombs: storyModeOverride?.bombs,
    });
    this.reviveBombsBase = this.state.bombs;
    this.applyActiveCharacter(primaryCharacter);
  }

  tickTimers(): void {
    tickFighterTimers(this.state);
  }

  cardDefinitions(): readonly AbilityCardDefinition[] {
    return this.battleCards.map((card) => card.definition);
  }

  acquireAbilityCard(card: AbilityCardDefinition): void {
    if (this.state.abilityCards.some((existing) => existing.id === card.id)) {
      return;
    }
    const battleCard = createBattleAbilityCard(card);
    const existingCards =
      card.kind === "active"
        ? this.state.abilityCards.filter(
            (existing) => existing.kind !== "active",
          )
        : this.state.abilityCards;
    const existingBattleCards =
      card.kind === "active"
        ? this.battleCards.filter(
            (existing) => existing.definition.kind !== "active",
          )
        : this.battleCards;
    this.battleCards = [...existingBattleCards, battleCard];
    this.state.abilityCards = [...existingCards, card];
    if (
      card.kind === "active" &&
      this.state.activeCard &&
      this.state.activeCard.id !== card.id
    ) {
      this.state.activeCard = undefined;
      this.activeBattleCard = undefined;
    }
    battleCard.onInitialize({
      self: this.state,
      resolution: {
        defaultBombs: this.reviveBombsBase,
        lifeLoss: 1,
        respawnBombDelta: 0,
      },
    });
  }

  setActiveAbilityCard(card: AbilityCardDefinition | undefined): void {
    if (card && card.kind !== "active") {
      return;
    }
    if (
      card &&
      !this.state.abilityCards.some((existing) => existing.id === card.id)
    ) {
      this.acquireAbilityCard(card);
    }
    this.state.activeCard = card;
    this.activeBattleCard = card ? createBattleAbilityCard(card) : undefined;
    this.resetActiveCardUsage();
  }

  resetActiveCardUsage(): void {
    const useLimit = this.state.activeCard?.useLimit;
    this.state.activeCardUses = typeof useLimit === "number" ? useLimit : 0;
    this.state.activeCardCooldownUntil = 0;
  }

  getPointCollectRadius(): number {
    return (
      this.activeCharacter.pointCollectRadius +
      this.battleCards.reduce(
        (total, card) => total + card.getPointCollectRadiusBonus(this.state),
        0,
      )
    );
  }

  getGrazeRadiusMultiplier(): number {
    return this.battleCards.reduce(
      (multiplier, card) =>
        multiplier * card.getGrazeRadiusMultiplier(this.state),
      1,
    );
  }

  collectShields(): readonly ShieldState[] {
    const shields: ShieldState[] = [];
    for (const card of this.battleCards) {
      shields.push(...card.collectShields(this.state));
    }
    return shields;
  }

  selectActiveCharacter(alternateHeld: boolean): void {
    if (
      this.state.actionLockedUntil > 0 ||
      this.state.nonFireActionLockedUntil > 0 ||
      this.state.switchLockedUntil > 0 ||
      this.state.reisenShieldLayers > 0
    ) {
      return;
    }
    const activeCharacter = alternateHeld
      ? this.state.alternateCharacter
      : this.state.primaryCharacter;
    if (
      this.state.activeCharacter.id !== activeCharacter.id &&
      this.state.reloadRemaining > 0
    ) {
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
    const moveSpeed =
      this.state.reisenShieldLayers > 0
        ? REISEN_SHIELD_MOVE_SPEED
        : (this.state.moveSpeedOverride ?? this.activeCharacter.moveSpeed);
    const speed = speedRankToPixelsPerTick(moveSpeed);
    this.state.x = fp.toFloat(
      fpClamp(
        fp.add(
          fp.fromFloat(this.state.x),
          fp.mul(fp.fromFloat(input.moveX), fp.fromFloat(speed)),
        ),
        fp.fromFloat(PLAYER_CORE_RADIUS),
        fp.fromFloat(this.arenaBounds.width - PLAYER_CORE_RADIUS),
      ),
    );
    this.state.y = fp.toFloat(
      fpClamp(
        fp.add(
          fp.fromFloat(this.state.y),
          fp.mul(fp.fromFloat(input.moveY), fp.fromFloat(speed)),
        ),
        fp.fromFloat(PLAYER_CORE_RADIUS),
        fp.fromFloat(this.arenaBounds.height - PLAYER_CORE_RADIUS),
      ),
    );
  }

  handleReload(reloadPressed: boolean): void {
    if (
      this.state.actionLockedUntil > 0 ||
      this.state.nonFireActionLockedUntil > 0
    ) {
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
    const fpReloadTotal = fpMax(
      fp.fromInt(1),
      fp.fromFloat(this.state.reloadTotal),
    );
    const reloadRatio = fp.sub(
      fp.fromInt(1),
      fp.div(fp.fromFloat(this.state.reloadRemaining), fpReloadTotal),
    );
    this.state.ammoDisplay = fp.toFloat(
      fpMin(
        fp.fromFloat(this.state.ammoCapacity),
        this.reloadDisplayAmmoFP(reloadRatio),
      ),
    );
    if (this.activeCharacter.reloadCommitPolicy === "commit_per_ammo") {
      const reloadedAmmo = this.reloadCommittedAmmo();
      this.state.ammo = reloadedAmmo;
      setCharacterAmmo(this.state, this.state.activeCharacter, reloadedAmmo);
    }
    if (this.state.reloadRemaining === 0) {
      this.state.ammo = this.state.ammoCapacity;
      this.state.ammoDisplay = this.state.ammoCapacity;
      setCharacterAmmo(
        this.state,
        this.state.activeCharacter,
        this.state.ammoCapacity,
      );
      this.state.reloadCharacterId = undefined;
    }
  }

  fire(ctx: CharacterActionContext, aimX: number, aimY: number): void {
    if (
      this.state.actionLockedUntil > 0 ||
      this.state.reloadRemaining > 0 ||
      this.state.deadUntil > 0
    ) {
      return;
    }
    if (this.state.ammo <= 0) {
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
    this.state.fireCooldownUntil = getFireCooldown(
      this.activeCharacter.fireRate,
    );
    this.activeCharacter.shoot(ctx, this.state, aimX, aimY);
    this.nonActiveCharacter.onAfterFire(ctx, this.state, aimX, aimY);
    for (const card of this.battleCards) {
      card.onAfterFire(ctx);
    }
  }

  useBomb(ctx: CharacterActionContext, aimX: number, aimY: number): void {
    if (
      this.state.actionLockedUntil > 0 ||
      this.state.nonFireActionLockedUntil > 0 ||
      !this.activeCharacter.canUseBomb(this.state) ||
      this.state.bombCooldownUntil > 0 ||
      this.state.deadUntil > 0
    ) {
      return;
    }
    this.activeCharacter.useBomb(ctx, this.state, aimX, aimY);
  }

  useActiveCard(ctx: CharacterActionContext): boolean {
    if (
      this.state.actionLockedUntil > 0 ||
      this.state.nonFireActionLockedUntil > 0 ||
      !this.state.activeCard ||
      this.state.activeCardUses <= 0 ||
      this.state.activeCardCooldownUntil > 0
    ) {
      return false;
    }

    this.state.activeCardUses -= 1;
    this.state.activeCardCooldownUntil = this.state.activeCard.cooldownTicks;
    this.activeBattleCard?.onUse(ctx);
    return true;
  }

  postUpdate(ctx: CharacterActionContext): void {
    this.activeCharacter.onPostUpdate(ctx, this.state);
    // Also update the non-active character so companions (e.g. Yukari's Ran)
    // stay alive and deal collision damage even after switching.
    this.nonActiveCharacter.onPostUpdate(ctx, this.state);
    for (const card of this.battleCards) {
      card.onPostUpdate(ctx);
    }
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
      if (
        this.storyModeOverride?.enabled === true &&
        card.storyModeOverride?.onHit
      ) {
        card.storyModeOverride.onHit(hitContext);
      } else {
        card.onHit(hitContext);
      }
    }
    if (hitContext.resolution.ignored) {
      return "accepted";
    }
    return applyHit({
      ...params,
      defaultBombs: hitContext.resolution.defaultBombs,
      lifeLoss: hitContext.resolution.lifeLoss,
      respawnBombDelta: hitContext.resolution.respawnBombDelta,
    });
  }

  private get activeCharacter(): BattleCharacter {
    return this.characterFor(this.state.activeCharacter);
  }

  private get nonActiveCharacter(): BattleCharacter {
    const nonActiveDef =
      this.state.activeCharacter.id === this.state.primaryCharacter.id
        ? this.state.alternateCharacter
        : this.state.primaryCharacter;
    return this.characterFor(nonActiveDef);
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
      this.characters.set(character.id, createBattleCharacter(character.id));
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
    const attacker =
      params.owner === "Player1"
        ? params.player
        : params.owner === "Player2"
          ? params.target
          : params.victim;
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
        defaultBombs:
          this.storyModeOverride?.enabled === true
            ? this.reviveBombsBase
            : DEFAULT_BOMBS,
        lifeLoss: 1,
        respawnBombDelta: 0,
        ignored: false,
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
    if (
      this.state.nonFireActionLockedUntil > 0 ||
      this.state.reloadRemaining > 0 ||
      this.state.ammo >= this.state.ammoCapacity
    ) {
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

  private reloadDisplayAmmoFP(fpRatio: number): number {
    const fpStarted = fp.fromFloat(this.state.reloadStartedAmmo);
    const fpCapacity = fp.fromFloat(this.state.ammoCapacity);
    return fp.add(fpStarted, fp.mul(fp.sub(fpCapacity, fpStarted), fpRatio));
  }

  private reloadTicksForMissingAmmo(): number {
    const missingAmmo = this.state.ammoCapacity - this.state.reloadStartedAmmo;
    const fpCount = fpMax(fp.fromInt(1), fp.fromInt(missingAmmo));
    return fp.toFloat(
      fp.mul(fpCount, fp.fromFloat(this.activeCharacter.reloadTicksPerAmmo)),
    );
  }

  private reloadStartAmmo(): number {
    return this.activeCharacter.reloadStartPolicy === "reset_to_zero"
      ? 0
      : this.state.ammo;
  }

  private reloadCommittedAmmo(): number {
    if (this.activeCharacter.reloadCommitPolicy === "commit_per_ammo") {
      const elapsedTicks = this.state.reloadTotal - this.state.reloadRemaining;
      const committedAmmo = Math.floor(
        elapsedTicks / this.activeCharacter.reloadTicksPerAmmo,
      );
      return Math.min(
        this.state.ammoCapacity,
        this.state.reloadStartedAmmo + committedAmmo,
      );
    }
    return this.state.reloadStartedAmmo;
  }
}

function normalizeAbilityCards(
  cards: readonly AbilityCardDefinition[],
  activeCard: AbilityCardDefinition | undefined,
): readonly AbilityCardDefinition[] {
  let activeKept = false;
  return cards.filter((card) => {
    if (card.kind !== "active") {
      return true;
    }
    if (!activeCard || activeKept || card.id !== activeCard.id) {
      return false;
    }
    activeKept = true;
    return true;
  });
}
