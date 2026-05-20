import type { ProjectileCollisionContext } from "@repo/types";

import { getAbilityCard, getCharacter } from "../content";
import { PLAYER_SPAWN, RESPAWN_DELAY_TICKS, TARGET_SPAWN } from "../constants";
import type { BattleLoadouts, FighterLoadout } from "../loadout";
import type { BattleInputState, BattleOutputState, EffectState, FighterState, ProjectileState, ShieldState, TrainingStats } from "../types";
import { BattleFighter } from "./battle-fighter";
import { CpuPlayer } from "../aicpu";
import { EffectSystem } from "./effects";
import { hashBattleModel, hashToHex } from "./hash";
import { BattlePhysics } from "./physics-adapter";
import { clearProjectilesAround, ProjectileSystem } from "./projectile";
import {
  createBattleModelSnapshot,
  restoreEffectSnapshot,
  restoreFighterSnapshot,
  restoreProjectileSnapshot,
  type BattleModelSnapshot,
} from "./snapshot";
import type { CharacterActionContext } from "../presets/characters";

export class BattleModel {
  readonly projectiles: ProjectileState[] = [];
  readonly effects: EffectState[] = [];
  readonly stats: TrainingStats = { shots: 0, hits: 0, bombUses: 0, damage: 0, elapsedTicks: 0 };
  frame = 0;
  gameOver = false;
  private readonly loadouts: BattleLoadouts;
  private readonly endOnTargetDefeat: boolean;
  private readonly projectileSystem = new ProjectileSystem();
  private readonly effectSystem = new EffectSystem();
  private readonly playerFighter: BattleFighter;
  private readonly targetFighter: BattleFighter;
  private readonly cpuPlayer: CpuPlayer | undefined;
  /** Rapier-backed collision provider. */
  private physics: BattlePhysics | undefined;
  /**
   * Deferred spawn queue for projectiles.
   * Populated during fighter action processing (Phase 2),
   * flushed after projectile stepping (Phase 3 post-update).
   * This prevents newly-spawned projectiles from being stepped
   * or hit-tested in the same frame they were created.
   */
  private pendingSpawns: Array<() => void> = [];

  constructor(loadouts: BattleLoadouts = DEFAULT_BATTLE_LOADOUTS, params: { readonly endOnTargetDefeat?: boolean } = {}) {
    this.loadouts = loadouts;
    this.endOnTargetDefeat = params.endOnTargetDefeat ?? false;
    this.playerFighter = new BattleFighter(
      "player",
      getCharacter(loadouts.player.primaryCharacterId),
      getCharacter(loadouts.player.alternateCharacterId),
      PLAYER_SPAWN.x,
      PLAYER_SPAWN.y,
      loadouts.player.activeCardId ? getAbilityCard(loadouts.player.activeCardId) : undefined,
      loadoutCards(loadouts.player),
    );
    this.targetFighter = new BattleFighter(
      "target",
      getCharacter(loadouts.target.primaryCharacterId),
      getCharacter(loadouts.target.alternateCharacterId),
      TARGET_SPAWN.x,
      TARGET_SPAWN.y,
      loadouts.target.activeCardId ? getAbilityCard(loadouts.target.activeCardId) : undefined,
      loadoutCards(loadouts.target),
    );
    this.cpuPlayer = this.endOnTargetDefeat ? new CpuPlayer() : undefined;
  }

  get player(): FighterState {
    return this.playerFighter.state;
  }

  get target(): FighterState {
    return this.targetFighter.state;
  }

  reset(): void {
    this.projectileSystem.reset();
    this.effectSystem.reset();
    this.projectiles.length = 0;
    this.effects.length = 0;
    this.stats.shots = 0;
    this.stats.hits = 0;
    this.stats.bombUses = 0;
    this.stats.damage = 0;
    this.stats.elapsedTicks = 0;
    this.frame = 0;
    this.gameOver = false;
    this.cpuPlayer?.reset();
    this.playerFighter.reset(
      getCharacter(this.loadouts.player.primaryCharacterId),
      getCharacter(this.loadouts.player.alternateCharacterId),
      PLAYER_SPAWN.x,
      PLAYER_SPAWN.y,
      this.loadouts.player.activeCardId ? getAbilityCard(this.loadouts.player.activeCardId) : undefined,
      loadoutCards(this.loadouts.player),
    );
    this.targetFighter.reset(
      getCharacter(this.loadouts.target.primaryCharacterId),
      getCharacter(this.loadouts.target.alternateCharacterId),
      TARGET_SPAWN.x,
      TARGET_SPAWN.y,
      this.loadouts.target.activeCardId ? getAbilityCard(this.loadouts.target.activeCardId) : undefined,
      loadoutCards(this.loadouts.target),
    );
  }

  step(input: BattleInputState): void {
    this.stepFrame(input, undefined, true);
  }

  /**
   * @param hostIsPlayer - When true (default), the "player" fighter has priority
   *   (processed first). The host / lower playerId should set this to true.
   */
  stepVersus(playerInput: BattleInputState, targetInput: BattleInputState, hostIsPlayer = true): void {
    if (hostIsPlayer) {
      this.stepFrame(playerInput, targetInput, true);
    } else {
      // Target (higher playerId) has priority → process them first
      this.stepFrame(targetInput, playerInput, false);
    }
  }

  /**
   * Frame stepping with three phases:
   *
   * Phase 1 – Tick all fighters' timers (order-independent).
   * Phase 2 – Process fighter actions in priority order (lower playerId first).
   * Phase 3 – Post-update: resolve projectile clashes, step projectiles,
   *           then flush deferred spawns so new projectiles start from next frame.
   */
  private stepFrame(
    firstInput: BattleInputState,
    secondInput: BattleInputState | undefined,
    firstIsPlayer: boolean,
  ): void {
    if (!this.physics?.isReady()) {
      throw new Error("BattleModel requires Rapier physics before stepping");
    }

    this.capturePreviousFighterState();
    this.frame += 1;
    this.stats.elapsedTicks += 1;

    // --- Phase 1: Timer ticking (order-independent) ---
    this.pendingSpawns = [];
    this.playerFighter.tickTimers();
    this.targetFighter.tickTimers();

    // Handle target death countdown (outside action processing)
    if (this.target.deadUntil > 0) {
      this.target.deadUntil -= 1;
      if (this.target.deadUntil === 0) {
        this.respawnTarget();
      }
    }

    if (this.gameOver) return;

    // --- Phase 2: Fighter actions in priority order ---
    if (firstIsPlayer) {
      this.processFighterActions(this.playerFighter, firstInput);
      this.processFighterActions(this.targetFighter, secondInput);
    } else {
      this.processFighterActions(this.targetFighter, firstInput);
      this.processFighterActions(this.playerFighter, secondInput);
    }

    // --- Phase 3: Post-update ---
    this.resolveProjectileClashes();
    this.projectileSystem.stepProjectiles({
      frame: this.frame,
      projectiles: this.projectiles,
      player: this.player,
      target: this.target,
      onHit: (ctx) => this.onProjectileHit(ctx),
      computeRapierHits: (projectiles) => this.physics!.computeCollisions(projectiles, this.player, this.target, this.currentShields()),
    });
    this.flushDeferredSpawns();
    this.effectSystem.stepEffects(this.effects, this.frame);
  }

  hash(): number {
    return hashBattleModel(this);
  }

  hashHex(): string {
    return hashToHex(this.hash());
  }

  toOutputState(): BattleOutputState {
    return {
      frame: this.frame,
      gameOver: this.gameOver,
      player: this.player,
      target: this.target,
      projectiles: this.projectiles,
      effects: this.effects,
      shields: this.currentShields(),
      stats: this.stats,
    };
  }

  serialize(): BattleModelSnapshot {
    return createBattleModelSnapshot({
      frame: this.frame,
      gameOver: this.gameOver,
      player: this.player,
      target: this.target,
      projectiles: this.projectiles,
      effects: this.effects,
      stats: this.stats,
    });
  }

  deserialize(snapshot: BattleModelSnapshot): void {
    if (snapshot.version !== 1) {
      throw new Error(`Unsupported battle model snapshot version: ${snapshot.version}`);
    }
    this.frame = snapshot.frame;
    this.gameOver = snapshot.gameOver;
    restoreFighterSnapshot(this.player, snapshot.player, this.frame);
    restoreFighterSnapshot(this.target, snapshot.target, this.frame);
    this.projectiles.splice(0, this.projectiles.length, ...snapshot.projectiles.map((projectile) => restoreProjectileSnapshot(projectile, this.frame)));
    this.effects.splice(0, this.effects.length, ...snapshot.effects.map((effect) => restoreEffectSnapshot(effect, this.frame)));
    Object.assign(this.stats, snapshot.stats);
    this.projectileSystem.restoreNextId(this.projectiles);
    this.effectSystem.restoreNextId(this.effects);
  }

  /** Inject the Rapier-backed physics provider. */
  setPhysics(physics: BattlePhysics): void {
    this.physics = physics;
  }

  isPhysicsReady(): boolean {
    return this.physics?.isReady() ?? false;
  }

  /**
   * Process one fighter's actions for this frame.
   * Called in priority order (by playerId, lower first).
   * Handles: character select, facing, movement, reload, active card, bomb, fire.
   */
  private processFighterActions(
    fighter: BattleFighter,
    input: BattleInputState | undefined,
  ): void {
    if (this.gameOver) return;
    const state = fighter.state;
    if (state.deadUntil > 0) return;

    // No input → AI or simple movement for the target fighter
    if (!input) {
      if (state.key === "target") {
        if (this.cpuPlayer) {
          this.stepTargetAi();
        } else {
          this.stepTargetSimple();
        }
      }
      return;
    }

    // Deterministic action order within a fighter's turn:
    // 1. Character select  2. Facing  3. Movement  4. Reload
    // 5. Active card  6. Bomb  7. Fire
    fighter.selectActiveCharacter(input.alternateHeld);
    state.facing = Math.atan2(input.aimY - state.y, input.aimX - state.x);
    fighter.moveBy(input);
    fighter.postUpdate(this.fighterActionContext(state));
    fighter.handleReload(input.reloadPressed);

    const ctx = this.fighterActionContext(state);
    if (input.activeCardPressed) {
      fighter.useActiveCard(ctx);
    }
    if (input.bombPressed) {
      fighter.useBomb(ctx);
    }
    if (input.shootPressed) {
      fighter.fire(ctx, input.aimX, input.aimY);
    }
  }

  private stepTargetAi(): void {
    const fighter = this.target;
    const aiInput = this.cpuPlayer!.getAction({
      frame: this.frame,
      self: fighter,
      opponent: this.player,
      projectiles: this.projectiles,
    });

    this.targetFighter.selectActiveCharacter(aiInput.alternateHeld);
    fighter.facing = Math.atan2(aiInput.aimY - fighter.y, aiInput.aimX - fighter.x);
    this.targetFighter.moveBy(aiInput);
    this.targetFighter.postUpdate(this.fighterActionContext(fighter));
    this.targetFighter.handleReload(aiInput.reloadPressed);

    const ctx = this.fighterActionContext(fighter);
    if (aiInput.bombPressed) {
      this.targetFighter.useBomb(ctx);
    }
    if (aiInput.shootPressed) {
      this.targetFighter.fire(ctx, aiInput.aimX, aiInput.aimY);
    }
  }

  private stepTargetSimple(): void {
    const fighter = this.target;
    if (fighter.movementLockedUntil === 0) {
      fighter.x = clamp(fighter.x + Math.sin(this.frame / 36) * 1.6, 780, 1150);
      fighter.y = clamp(fighter.y + Math.cos(this.frame / 50) * 1.2, 72, 600);
    }
    fighter.facing = Math.atan2(this.player.y - fighter.y, this.player.x - fighter.x);
    this.targetFighter.postUpdate(this.fighterActionContext(fighter));
    if (this.frame % 72 === 0) {
      this.targetFighter.fire(this.fighterActionContext(fighter), this.player.x, this.player.y);
    }
  }

  private onProjectileHit(ctx: ProjectileCollisionContext<ProjectileState, FighterState, "player" | "target">): boolean {
    const { owner, victim, damage } = ctx;
    const victimFighter = victim.key === "player" ? this.playerFighter : this.targetFighter;
    const attackerFighter = owner === "player" ? this.playerFighter : this.targetFighter;
    const result = victimFighter.onProjectileHit({
      owner,
      victim,
      player: this.player,
      target: this.target,
      stats: this.stats,
      frame: this.frame,
      damage,
      actionContext: this.fighterActionContext(victim),
      attackerCards: attackerFighter.cardDefinitions(),
    });
    if (result === "ignored") {
      return false;
    }
    if (victim.timeStopUntil > 0) {
      this.cancelTimeStop(victim);
    }
    if (result === "game-over") {
      this.gameOver = true;
      return true;
    }
    if (victim.key === "target" && victim.lives <= 0) {
      if (this.endOnTargetDefeat) {
        this.gameOver = true;
        return true;
      }
      victim.deadUntil = RESPAWN_DELAY_TICKS;
    }
    return true;
  }

  private respawnTarget(): void {
    this.targetFighter.reset(
      getCharacter(this.loadouts.target.primaryCharacterId),
      getCharacter(this.loadouts.target.alternateCharacterId),
      TARGET_SPAWN.x,
      TARGET_SPAWN.y,
      this.loadouts.target.activeCardId ? getAbilityCard(this.loadouts.target.activeCardId) : undefined,
      loadoutCards(this.loadouts.target),
    );
  }

  private cancelTimeStop(caster: FighterState): void {
    const opponent = caster.key === "player" ? this.target : this.player;
    caster.timeStopUntil = 0;
    caster.projectilePauseUntil = 0;
    caster.nonFireActionLockedUntil = 0;
    opponent.actionLockedUntil = 0;
    opponent.movementLockedUntil = 0;
    for (const projectile of this.projectiles) {
      if (this.frame < projectile.pausedUntil) {
        projectile.pausedUntil = this.frame;
      }
    }
  }

  private fighterActionContext(self: FighterState): CharacterActionContext {
    const frame = this.frame;
    return {
      frame,
      self,
      opponent: self.key === "player" ? this.target : this.player,
      projectiles: this.projectiles,
      effects: this.effects,
      stats: this.stats,
      spawnBullet: (params) => {
        // Defer: collect spawn, flush in post-update after projectile stepping
        const spawnParams = { ...params, frame: params.frame ?? frame };
        this.pendingSpawns.push(() => {
          this.projectileSystem.spawnBullet(this.projectiles, spawnParams);
        });
      },
      spawnLaser: (params) => {
        const spawnParams = { ...params, frame: params.frame ?? frame };
        this.pendingSpawns.push(() => {
          this.projectileSystem.spawnLaser(this.projectiles, spawnParams);
        });
      },
      clearProjectilesAround: (params) => clearProjectilesAround(this.projectiles, params.x, params.y, params.radius),
      spawnEffectRing: (params) => {
        this.effectSystem.spawnRing(this.effects, this.frame, params.x, params.y, params.tint, params.scale, params.duration);
      },
      spawnClearRing: (params) => {
        this.effectSystem.spawnRing(this.effects, this.frame, params.x, params.y, params.tint, params.radius / 100, params.duration);
      },
    };
  }

  /** Post-update: flush all deferred projectiles into the active array. */
  private flushDeferredSpawns(): void {
    for (const spawn of this.pendingSpawns) {
      spawn();
    }
    this.pendingSpawns = [];
  }

  private capturePreviousFighterState(): void {
    for (const fighter of [this.player, this.target]) {
      fighter.previousX = fighter.x;
      fighter.previousY = fighter.y;
      fighter.previousFacing = fighter.facing;
    }
  }

  private resolveProjectileClashes(): void {
    const masters = this.projectiles.filter((projectile) => projectile.kind === "spark" && projectile.height >= 36 && projectile.damage > 0 && this.frame >= projectile.pausedUntil);
    if (masters.length === 0) {
      return;
    }

    this.projectiles.splice(
      0,
      this.projectiles.length,
      ...this.projectiles.filter((projectile) => {
        if (projectile.kind === "laser") {
          return true;
        }
        return !masters.some((master) => master.owner !== projectile.owner && hitsBeam(master, projectile.x, projectile.y));
      }),
    );
  }

  private currentShields(): readonly ShieldState[] {
    const shields: ShieldState[] = [];
    if (this.player.deadUntil <= 0) {
      shields.push(...this.playerFighter.collectShields());
    }
    if (this.target.deadUntil <= 0) {
      shields.push(...this.targetFighter.collectShields());
    }
    return shields;
  }

}

const DEFAULT_BATTLE_LOADOUTS: BattleLoadouts = {
  player: {
    primaryCharacterId: "reimu",
    alternateCharacterId: "marisa",
    cardIds: ["spirit_strike_card"],
    activeCardId: "spirit_strike_card",
  },
  target: {
    primaryCharacterId: "sakuya",
    alternateCharacterId: "reimu",
    cardIds: ["spirit_strike_card"],
    activeCardId: "spirit_strike_card",
  },
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function hitsBeam(beam: ProjectileState, x: number, y: number): boolean {
  const dx = x - beam.x;
  const dy = y - beam.y;
  const forward = dx * Math.cos(beam.angle) + dy * Math.sin(beam.angle);
  const side = Math.abs(-dx * Math.sin(beam.angle) + dy * Math.cos(beam.angle));
  if (!Number.isFinite(beam.width)) {
    return forward >= 0 && side <= beam.height / 2;
  }
  return Math.abs(forward) <= beam.width / 2 && side <= beam.height / 2;
}

function loadoutCards(loadout: FighterLoadout) {
  const ids = new Set(loadout.cardIds ?? []);
  if (loadout.activeCardId) {
    ids.add(loadout.activeCardId);
  }
  return Array.from(ids).map((id) => getAbilityCard(id));
}
