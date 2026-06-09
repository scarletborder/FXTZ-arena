import { fp } from "@shaisrc/fixed-point";

import {
  PLAYER_CORE_RADIUS,
  ENEMY_PROJECTILE_GRAZE_POINT_REWARD,
  NEUTRAL_PROJECTILE_GRAZE_POINT_REWARD,
  PLAYER_SPAWN,
  TARGET_SPAWN,
  type NeutralMobActionContext,
  type NeutralMobState,
  type ProjectileCollisionContext,
} from "@repo/types";

import { getAbilityCard, getCharacter } from "../content";
import type { BattleLoadouts, FighterLoadout } from "../loadout";
import type { BattleInputState, BattleRoomMode } from "@repo/types";
import type {
  BattleOutputState,
  EffectState,
  FighterKey,
  FighterState,
  PointState,
  ProjectileState,
  ShieldState,
  TrainingStats,
} from "@repo/content";
import type { NeutralMobSpawner } from "@repo/content";
import { resolveMobSpawner } from "@repo/content";
import { BattleFighter } from "./battle-fighter";
import { createBattleRules, type BattleRules } from "./battle-rules";
import { CpuPlayer } from "../aicpu";
import { EffectSystem } from "./effects";
import type { ClearRingState } from "./entities/clear-ring";
import { hashBattleModel, hashBattleModelComponents, hashToHex } from "./hash";
import { BattlePhysics } from "./physics-adapter";
import {
  ProjectileSystem,
  type BulletProjectileParams,
  type LaserProjectileParams,
  type ProjectileHitTarget,
} from "./projectile";
import {
  createBattleModelSnapshot,
  restoreEffectSnapshot,
  restoreFighterSnapshot,
  restoreProjectileSnapshot,
  type BattleModelSnapshot,
} from "./snapshot";
import { TickerManager } from "./ticker-manager";
import type { CharacterActionContext } from "@repo/content";
import { fpClamp, fpAtan2 } from "@repo/content";
import { ClearRingManager } from "./manager/clear-ring-manager";
import { NeutralMobManager } from "./manager/neutral-mob-manager";
import {
  clampPointCount,
  PointManager,
} from "./manager/point-manager";
import { ActiveCardCooldownManager } from "./manager/active-card-cooldown-manager";

export class BattleModel {
  readonly projectiles: ProjectileState[] = [];
  readonly effects: EffectState[] = [];
  readonly stats: TrainingStats = {
    shots: 0,
    hits: 0,
    bombUses: 0,
    damage: 0,
    elapsedTicks: 0,
  };
  frame = 0;
  gameOver = false;
  /**
   * Set to true during stepFrame when a system reads aim coordinates in
   * a way that would alter the simulation output (shoot, bomb, active
   * card, or an existing projectile retargeting toward the owner's aim).
   * Read by the hash so facing is included only when it materially
   * matters, and by CombatSyncManager so sameIntent compares aim on
   * frames where it changed the simulation.
   */
  aimConsumedThisFrame = false;

  /** Exposed for hash — the integer-truncated aim coordinates per fighter. */
  get currentAim(): Record<
    FighterKey,
    { readonly x: number; readonly y: number }
  > {
    return this.currentAimByFighter;
  }

  private readonly currentAimByFighter: Record<
    FighterKey,
    { readonly x: number; readonly y: number }
  > = {
    Player1: { x: TARGET_SPAWN.x, y: TARGET_SPAWN.y },
    Player2: { x: PLAYER_SPAWN.x, y: PLAYER_SPAWN.y },
    Neutral: { x: 0, y: 0 },
  };
  private readonly loadouts: BattleLoadouts;
  private readonly rules: BattleRules;
  readonly neutralMobManager: NeutralMobManager;
  readonly pointManager = new PointManager();
  readonly clearRingManager = new ClearRingManager();
  private readonly projectileSystem = new ProjectileSystem();
  private readonly effectSystem = new EffectSystem();
  private readonly ticker = new TickerManager();
  private readonly activeCardCooldowns = new ActiveCardCooldownManager(
    this.ticker,
  );
  private readonly playerInitPoint: number;
  private readonly opponentInitPoint: number;
  private readonly playerFighter: BattleFighter;
  private readonly targetFighter: BattleFighter;
  private readonly cpuPlayer: CpuPlayer | undefined;
  private physics: BattlePhysics | undefined;
  private pendingSpawns: Array<() => void> = [];

  /** After each step, stores the input used for the target fighter (AI or manually provided). */
  lastTargetInput: BattleInputState | null = null;
  /** After each step, stores the input used for the player fighter. */
  lastPlayerInput: BattleInputState | null = null;

  constructor(
    loadouts: BattleLoadouts = DEFAULT_BATTLE_LOADOUTS,
    params: {
      readonly enableCpuTarget?: boolean;
      readonly neutralMobSpawner?: NeutralMobSpawner | null;
      readonly battleMode?: BattleRoomMode;
      readonly playerInitPoint?: number;
      readonly opponentInitPoint?: number;
      readonly ai?: {
        readonly smartDurationSeconds?: number;
        readonly dumbRampSeconds?: number;
      };
    } = {},
  ) {
    this.loadouts = loadouts;
    this.rules = createBattleRules(params.battleMode ?? "versus");
    this.playerInitPoint = clampPointCount(params.playerInitPoint ?? 0);
    this.opponentInitPoint = clampPointCount(params.opponentInitPoint ?? 0);
    this.playerFighter = new BattleFighter(
      "Player1",
      getCharacter(loadouts.player.primaryCharacterId),
      getCharacter(loadouts.player.alternateCharacterId),
      PLAYER_SPAWN.x,
      PLAYER_SPAWN.y,
      loadouts.player.activeCardId
        ? getAbilityCard(loadouts.player.activeCardId)
        : undefined,
      loadoutCards(loadouts.player),
      loadouts.player.storyModeOverride,
    );
    this.targetFighter = new BattleFighter(
      "Player2",
      getCharacter(loadouts.target.primaryCharacterId),
      getCharacter(loadouts.target.alternateCharacterId),
      TARGET_SPAWN.x,
      TARGET_SPAWN.y,
      loadouts.target.activeCardId
        ? getAbilityCard(loadouts.target.activeCardId)
        : undefined,
      loadoutCards(loadouts.target),
      loadouts.target.storyModeOverride,
    );
    this.applyInitialPoints();
    this.cpuPlayer = params.enableCpuTarget ? new CpuPlayer(params.ai) : undefined;
    const mobSpawner =
      params.neutralMobSpawner === undefined
        ? (resolveMobSpawner("default-a") ?? undefined)
        : (params.neutralMobSpawner ?? undefined);
    this.neutralMobManager = new NeutralMobManager(mobSpawner);
  }

  get player(): FighterState {
    return this.playerFighter.state;
  }

  get target(): FighterState {
    return this.targetFighter.state;
  }

  get points(): PointState[] {
    return this.pointManager.points;
  }

  get clearRings(): ClearRingState[] {
    return this.clearRingManager.clearRings;
  }

  reset(): void {
    this.projectileSystem.reset();
    this.effectSystem.reset();
    this.neutralMobManager.reset();
    this.pointManager.reset();
    this.clearRingManager.reset();
    this.projectiles.length = 0;
    this.effects.length = 0;
    this.stats.shots = 0;
    this.stats.hits = 0;
    this.stats.bombUses = 0;
    this.stats.damage = 0;
    this.stats.elapsedTicks = 0;
    this.frame = 0;
    this.ticker.reset();
    this.gameOver = false;
    this.physics?.reset();
    this.cpuPlayer?.reset();
    this.playerFighter.reset(
      getCharacter(this.loadouts.player.primaryCharacterId),
      getCharacter(this.loadouts.player.alternateCharacterId),
      PLAYER_SPAWN.x,
      PLAYER_SPAWN.y,
      this.loadouts.player.activeCardId
        ? getAbilityCard(this.loadouts.player.activeCardId)
        : undefined,
      loadoutCards(this.loadouts.player),
      this.loadouts.player.storyModeOverride,
    );
    this.targetFighter.reset(
      getCharacter(this.loadouts.target.primaryCharacterId),
      getCharacter(this.loadouts.target.alternateCharacterId),
      TARGET_SPAWN.x,
      TARGET_SPAWN.y,
      this.loadouts.target.activeCardId
        ? getAbilityCard(this.loadouts.target.activeCardId)
        : undefined,
      loadoutCards(this.loadouts.target),
      this.loadouts.target.storyModeOverride,
    );
    this.applyInitialPoints();
  }

  private applyInitialPoints(): void {
    this.pointManager.setPointCount(this.player, this.playerInitPoint);
    this.pointManager.setPointCount(this.target, this.opponentInitPoint);
  }

  step(input: BattleInputState): void {
    this.stepFrame(input, undefined, true);
  }

  stepVersus(
    playerInput: BattleInputState,
    targetInput: BattleInputState,
    hostIsPlayer = true,
  ): void {
    if (hostIsPlayer) {
      this.stepFrame(playerInput, targetInput, true);
    } else {
      this.stepFrame(targetInput, playerInput, false);
    }
  }

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
    this.aimConsumedThisFrame = false;
    this.lastTargetInput = null;
    this.lastPlayerInput = null;
    this.ticker.setCurrentFrame(this.frame);
    this.stats.elapsedTicks += 1;

    // --- Phase 1: Timer ticking (order-independent) ---
    this.pendingSpawns = [];
    this.playerFighter.tickTimers();
    this.targetFighter.tickTimers();
    this.activeCardCooldowns.sync([this.player, this.target]);

    if (this.gameOver) return;

    // --- Phase 2: Fighter actions in priority order ---
    if (firstIsPlayer) {
      this.processFighterActions(this.playerFighter, firstInput);
      this.processFighterActions(this.targetFighter, secondInput);
      if (firstInput !== undefined) this.lastPlayerInput = firstInput;
      if (secondInput !== undefined) this.lastTargetInput = secondInput;
    } else {
      this.processFighterActions(this.targetFighter, firstInput);
      this.processFighterActions(this.playerFighter, secondInput);
      if (firstInput !== undefined) this.lastTargetInput = firstInput;
      if (secondInput !== undefined) this.lastPlayerInput = secondInput;
    }
    this.stepMobSpawner();
    this.stepNeutralMobs();

    // --- Phase 3: Post-update ---
    this.resolveProjectileClashes();
    const physics = this.physics;
    const projAimConsumed = { value: false };
    this.projectileSystem.stepProjectiles({
      frame: this.frame,
      projectiles: this.projectiles,
      player: this.player,
      target: this.target,
      aimByFighter: this.currentAimByFighter,
      aimConsumedRef: projAimConsumed,
      hitTargets: this.currentHitTargets(),
      shields: this.currentShields(),
      rules: this.rules,
      computeRapierHits: physics
        ? (projectiles) =>
            physics.computeCollisions(
              projectiles,
              this.player,
              this.target,
              this.currentShields(),
              this.neutralMobManager.states(),
              this.points,
              {
                Player1: this.playerFighter.getGrazeRadiusMultiplier(),
                Player2: this.targetFighter.getGrazeRadiusMultiplier(),
              },
            )
        : undefined,
      onHit: (ctx) => this.onProjectileHit(ctx),
      onGraze: (ctx) => this.onProjectileGraze(ctx),
      clearProjectiles: (projectiles) => this.stepClearRings(projectiles),
    });
    if (projAimConsumed.value) {
      this.aimConsumedThisFrame = true;
    }
    this.removeInactiveNeutralMobs();
    this.stepPoints();
    physics?.syncPointBodies(this.pointManager.points);
    this.flushDeferredSpawns();
    this.effectSystem.stepEffects(this.effects, this.frame);
  }

  hash(): number {
    return hashBattleModel(this);
  }

  hashHex(): string {
    return hashToHex(this.hash());
  }

  /**
   * Debug: hash each subsystem separately so a peer-desync can be narrowed
   * down to fighters, projectiles, effects, etc.
   */
  hashComponentsDebug(): Record<string, string> {
    return hashBattleModelComponents(this);
  }

  toOutputState(): BattleOutputState {
    return {
      frame: this.frame,
      gameOver: this.gameOver,
      player: this.player,
      target: this.target,
      points: this.points,
      neutralMobs: this.neutralMobManager.states(),
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
      nextProjectileId: this.projectileSystem.getNextId(),
      nextEffectId: this.effectSystem.getNextId(),
      nextNeutralMobId: this.neutralMobManager.getNextNeutralMobId(),
      nextPointId: this.pointManager.getNextPointId(),
      nextClearRingId: this.clearRingManager.getNextClearRingId(),
      neutralMobs: this.neutralMobManager.states(),
      points: this.points,
      clearRings: this.clearRings,
      mobSpawner: this.neutralMobManager.mobSpawnerState(),
      ticker: this.ticker.snapshot(),
    });
  }

  deserialize(snapshot: BattleModelSnapshot): void {
    if (snapshot.version !== 1) {
      throw new Error(
        `Unsupported battle model snapshot version: ${snapshot.version}`,
      );
    }
    this.frame = snapshot.frame;
    this.ticker.restore(
      snapshot.ticker ?? {
        currentFrame: this.frame,
        nextTimerId: 1,
        timers: [],
      },
    );
    this.ticker.setCurrentFrame(this.frame);
    this.gameOver = snapshot.gameOver;
    restoreFighterSnapshot(this.player, snapshot.player, this.frame);
    restoreFighterSnapshot(this.target, snapshot.target, this.frame);
    this.projectiles.splice(
      0,
      this.projectiles.length,
      ...snapshot.projectiles.map((projectile) =>
        restoreProjectileSnapshot(projectile, this.ticker),
      ),
    );
    this.effects.splice(
      0,
      this.effects.length,
      ...snapshot.effects.map((effect) =>
        restoreEffectSnapshot(effect, this.frame),
      ),
    );
    this.pointManager.restore(snapshot.points, snapshot.nextPointId);
    this.clearRingManager.restore(
      snapshot.clearRings,
      this.frame,
      snapshot.nextClearRingId,
    );
    this.activeCardCooldowns.restore([this.player, this.target], this.frame);
    this.neutralMobManager.restoreSnapshots(snapshot.neutralMobs);
    Object.assign(this.stats, snapshot.stats);
    this.projectileSystem.restoreNextId(
      this.projectiles,
      snapshot.nextProjectileId,
    );
    this.effectSystem.restoreNextId(this.effects, snapshot.nextEffectId);
    this.neutralMobManager.restoreNextId(
      snapshot.nextNeutralMobId,
      snapshot.neutralMobs,
    );
    this.neutralMobManager.restoreSpawner(snapshot.mobSpawner);
    this.physics?.reset();
  }

  setPhysics(physics: BattlePhysics): void {
    this.physics = physics;
  }

  isPhysicsReady(): boolean {
    return this.physics?.isReady() ?? false;
  }

  private processFighterActions(
    fighter: BattleFighter,
    input: BattleInputState | undefined,
  ): void {
    if (this.gameOver) return;
    const state = fighter.state;
    if (state.deadUntil > 0) return;

    if (!input) {
      if (state.key === "Player2") {
        if (this.cpuPlayer) {
          this.stepTargetAi();
        } else {
          this.stepTargetSimple();
        }
      }
      return;
    }

    // Deterministic action order within a fighter's turn:
    fighter.selectActiveCharacter(input.alternateHeld);
    this.currentAimByFighter[state.key] = { x: input.aimX, y: input.aimY };
    state.facing = fpAtan2(
      fp.fromFloat(input.aimY - state.y),
      fp.fromFloat(input.aimX - state.x),
    );
    fighter.moveBy(input);
    fighter.postUpdate(this.fighterActionContext(state));
    fighter.handleReload(input.reloadPressed);

    const ctx = this.fighterActionContext(state);
    if (input.activeCardPressed) {
      if (fighter.useActiveCard(ctx)) {
        this.activeCardCooldowns.register(state, this.frame);
        this.aimConsumedThisFrame = true;
      }
    }
    if (input.bombPressed) {
      const previousTimeStopUntil = state.timeStopUntil;
      fighter.useBomb(ctx, input.aimX, input.aimY);
      this.aimConsumedThisFrame = true;
      if (
        state.activeCharacter.bombId === "sakuya_time_stop" &&
        state.timeStopUntil > previousTimeStopUntil
      ) {
        this.activeCardCooldowns.pause(
          [this.player, this.target],
          state.timeStopUntil - previousTimeStopUntil,
        );
      }
    }
    if (input.shootPressed) {
      fighter.fire(ctx, input.aimX, input.aimY);
      this.aimConsumedThisFrame = true;
    }
  }

  private stepTargetAi(): void {
    const fighter = this.target;
    const aiInput = this.cpuPlayer!.getAction({
      frame: this.frame,
      self: fighter,
      opponent: this.player,
      projectiles: this.projectiles,
      neutralMobs: this.neutralMobManager.states(),
      points: this.points,
    });

    this.lastTargetInput = aiInput;
    this.targetFighter.selectActiveCharacter(aiInput.alternateHeld);
    this.currentAimByFighter[fighter.key] = {
      x: aiInput.aimX,
      y: aiInput.aimY,
    };
    fighter.facing = fpAtan2(
      fp.fromFloat(aiInput.aimY - fighter.y),
      fp.fromFloat(aiInput.aimX - fighter.x),
    );
    this.targetFighter.moveBy(aiInput);
    this.targetFighter.postUpdate(this.fighterActionContext(fighter));
    this.targetFighter.handleReload(aiInput.reloadPressed);

    const ctx = this.fighterActionContext(fighter);
    if (aiInput.bombPressed) {
      const previousTimeStopUntil = fighter.timeStopUntil;
      this.targetFighter.useBomb(ctx, aiInput.aimX, aiInput.aimY);
      if (
        fighter.activeCharacter.bombId === "sakuya_time_stop" &&
        fighter.timeStopUntil > previousTimeStopUntil
      ) {
        this.activeCardCooldowns.pause(
          [this.player, this.target],
          fighter.timeStopUntil - previousTimeStopUntil,
        );
      }
    }
    if (aiInput.shootPressed) {
      this.targetFighter.fire(ctx, aiInput.aimX, aiInput.aimY);
    }
  }

  private stepTargetSimple(): void {
    const fighter = this.target;
    if (fighter.movementLockedUntil === 0) {
      // Sinusoidal movement pattern for the simple AI target
      const fpFrame = fp.fromInt(this.frame);
      const fpSinOffset = fp.mul(
        fp.sin(fp.div(fpFrame, fp.fromInt(36))),
        fp.fromFloat(1.6),
      );
      const fpCosOffset = fp.mul(
        fp.cos(fp.div(fpFrame, fp.fromInt(50))),
        fp.fromFloat(1.2),
      );
      fighter.x = fp.toFloat(
        fpClamp(
          fp.add(fp.fromFloat(fighter.x), fpSinOffset),
          fp.fromInt(780),
          fp.fromInt(1150),
        ),
      );
      fighter.y = fp.toFloat(
        fpClamp(
          fp.add(fp.fromFloat(fighter.y), fpCosOffset),
          fp.fromInt(72),
          fp.fromInt(600),
        ),
      );
    }
    fighter.facing = fpAtan2(
      fp.fromFloat(this.player.y - fighter.y),
      fp.fromFloat(this.player.x - fighter.x),
    );
    this.currentAimByFighter[fighter.key] = {
      x: this.player.x,
      y: this.player.y,
    };
    this.targetFighter.postUpdate(this.fighterActionContext(fighter));
    const shootPressed = this.frame % 72 === 0;
    if (shootPressed) {
      this.targetFighter.fire(
        this.fighterActionContext(fighter),
        this.player.x,
        this.player.y,
      );
    }
    this.lastTargetInput = {
      moveX: Math.sin(this.frame / 36) > 0.01 ? 1 : Math.sin(this.frame / 36) < -0.01 ? -1 : 0,
      moveY: Math.cos(this.frame / 50) > 0.01 ? 1 : Math.cos(this.frame / 50) < -0.01 ? -1 : 0,
      aimX: Math.trunc(this.player.x),
      aimY: Math.trunc(this.player.y),
      shootPressed,
      bombPressed: false,
      activeCardPressed: false,
      reloadPressed: false,
      alternateHeld: false,
      infoHeld: false,
    };
  }

  private onProjectileHit(
    ctx: ProjectileCollisionContext<
      ProjectileState,
      ProjectileHitTarget,
      FighterKey
    >,
  ): boolean {
    const { owner, victim } = ctx;
    if (!this.rules.canProjectileDamageTarget(owner, victim.key)) {
      return false;
    }
    if (victim.key === "Neutral") {
      return this.neutralMobManager.handleProjectileHit({
        target: victim,
        owner,
        damage: ctx.projectile.damage,
        onKilled: (mob) => this.dropPointFromMob(mob),
      });
    }
    const damage = ctx.damage;
    const fighterState = victim.key === "Player1" ? this.player : this.target;
    const victimFighter =
      victim.key === "Player1" ? this.playerFighter : this.targetFighter;
    const attackerCards =
      owner === "Player1"
        ? this.playerFighter.cardDefinitions()
        : owner === "Player2"
          ? this.targetFighter.cardDefinitions()
          : [];
    const result = victimFighter.onProjectileHit({
      owner,
      victim: fighterState,
      player: this.player,
      target: this.target,
      stats: this.stats,
      frame: this.frame,
      damage,
      actionContext: this.fighterActionContext(fighterState),
      attackerCards,
    });
    if (result === "ignored") {
      return false;
    }
    if (fighterState.timeStopUntil > 0) {
      this.cancelTimeStop(fighterState);
    }
    if (result === "game-over") {
      this.gameOver = true;
      return true;
    }
    return true;
  }

  private onProjectileGraze(
    ctx: ProjectileCollisionContext<
      ProjectileState,
      ProjectileHitTarget,
      FighterKey
    >,
  ): void {
    const { owner, victim, projectile } = ctx;
    if (victim.key !== "Player1" && victim.key !== "Player2") {
      return;
    }
    if (!this.rules.canProjectileGrazeTarget(owner, victim.key)) {
      return;
    }
    const fighter = victim.key === "Player1" ? this.player : this.target;
    if (
      fighter.deadUntil > 0 ||
      fighter.grazedProjectileIds.includes(projectile.id)
    ) {
      return;
    }
    fighter.grazedProjectileIds = [
      ...fighter.grazedProjectileIds,
      projectile.id,
    ];
    fighter.pointCount = clampPointCount(
      fighter.pointCount +
        (owner === "Neutral"
          ? NEUTRAL_PROJECTILE_GRAZE_POINT_REWARD
          : ENEMY_PROJECTILE_GRAZE_POINT_REWARD),
    );
  }

  private cancelTimeStop(caster: FighterState): void {
    const opponent = caster.key === "Player1" ? this.target : this.player;
    const remainingPauseTicks = caster.timeStopUntil;
    caster.timeStopUntil = 0;
    caster.projectilePauseUntil = 0;
    caster.nonFireActionLockedUntil = 0;
    opponent.actionLockedUntil = 0;
    opponent.movementLockedUntil = 0;
    for (const projectile of this.projectiles) {
      this.ticker.resumeProjectileTimeline(projectile, remainingPauseTicks);
    }
    this.activeCardCooldowns.resume(
      [this.player, this.target],
      remainingPauseTicks,
    );
  }

  private fighterActionContext(self: FighterState): CharacterActionContext {
    const frame = this.frame;
    return {
      frame,
      self,
      opponent: self.key === "Player1" ? this.target : this.player,
      projectiles: this.projectiles,
      effects: this.effects,
      stats: this.stats,
      spawnBullet: (params) => {
        const spawnFrame = params.frame ?? frame;
        const owner = params.owner === "Player1" ? this.player : this.target;
        const pauseTicks =
          params.pausedUntil === undefined ? owner.projectilePauseUntil : 0;
        const spawnParams = {
          ...params,
          sourceCharacterId:
            params.sourceCharacterId ?? self.activeCharacter.id,
          frame: spawnFrame,
          pausedUntil: params.pausedUntil ?? spawnFrame,
        };
        this.pendingSpawns.push(() => {
          const startIndex = this.projectiles.length;
          this.projectileSystem.spawnBullet(this.projectiles, spawnParams);
          const projectile = this.projectiles[startIndex];
          if (projectile) {
            this.ticker.pauseProjectileTimeline(projectile, pauseTicks);
          }
        });
      },
      spawnLaser: (params) => {
        const spawnFrame = params.frame ?? frame;
        const owner = params.owner === "Player1" ? this.player : this.target;
        const pauseTicks =
          params.pausedUntil === undefined ? owner.projectilePauseUntil : 0;
        const spawnParams = {
          ...params,
          sourceCharacterId:
            params.sourceCharacterId ?? self.activeCharacter.id,
          frame: spawnFrame,
          pausedUntil: params.pausedUntil ?? spawnFrame,
        };
        this.pendingSpawns.push(() => {
          const startIndex = this.projectiles.length;
          this.projectileSystem.spawnLaser(this.projectiles, spawnParams);
          const projectile = this.projectiles[startIndex];
          if (projectile) {
            this.ticker.pauseProjectileTimeline(projectile, pauseTicks);
          }
        });
      },
      spawnSegment: (params) => {
        const spawnFrame = params.frame ?? frame;
        const owner = params.owner === "Player1" ? this.player : this.target;
        const pauseTicks =
          params.pausedUntil === undefined ? owner.projectilePauseUntil : 0;
        const spawnParams = {
          ...params,
          sourceCharacterId:
            params.sourceCharacterId ?? self.activeCharacter.id,
          frame: spawnFrame,
          pausedUntil: params.pausedUntil ?? spawnFrame,
        };
        this.pendingSpawns.push(() => {
          const startIndex = this.projectiles.length;
          this.projectileSystem.spawnSegment(this.projectiles, spawnParams);
          const projectile = this.projectiles[startIndex];
          if (projectile) {
            this.ticker.pauseProjectileTimeline(projectile, pauseTicks);
          }
        });
      },
      clearProjectilesAround: (params) => {
        const before = this.projectiles.length;
        this.spawnClearRingEntity({
          owner: self.key,
          x: params.x,
          y: params.y,
          radius: params.radius,
          duration: 1,
        });
        return before - this.projectiles.length;
      },
      spawnClearRingEntity: (params) => {
        this.spawnClearRingEntity({
          owner: self.key,
          ...params,
        });
      },
      spawnClearRing: (params) => {
        this.effectSystem.spawnRing(
          this.effects,
          this.frame,
          params.x,
          params.y,
          params.tint,
          fp.toFloat(fp.div(fp.fromFloat(params.radius), fp.fromInt(100))),
          params.duration,
        );
      },
      pauseProjectileTimeline: (projectile, ticks) => {
        this.ticker.pauseProjectileTimeline(projectile, ticks);
      },
    };
  }

  private neutralMobActionContext(): NeutralMobActionContext<
    BulletProjectileParams,
    LaserProjectileParams
  > {
    const frame = this.frame;
    return {
      frame,
      player: { x: this.player.x, y: this.player.y },
      target: { x: this.target.x, y: this.target.y },
      spawnBullet: (params: BulletProjectileParams) => {
        const spawnParams = {
          ...params,
          owner: "Neutral" as const,
          sourceCharacterId: undefined,
          frame: params.frame ?? frame,
        };
        this.pendingSpawns.push(() => {
          this.projectileSystem.spawnBullet(this.projectiles, spawnParams);
        });
      },
      spawnLaser: (params: LaserProjectileParams) => {
        const spawnParams = {
          ...params,
          owner: "Neutral" as const,
          sourceCharacterId: undefined,
          frame: params.frame ?? frame,
        };
        this.pendingSpawns.push(() => {
          this.projectileSystem.spawnLaser(this.projectiles, spawnParams);
        });
      },
    };
  }

  private stepMobSpawner(): void {
    this.neutralMobManager.stepSpawner({
      frame: this.frame,
      player: this.player,
      target: this.target,
      timeStopped: this.timeStopped(),
    });
  }

  private stepNeutralMobs(): void {
    this.neutralMobManager.stepMobs({
      timeStopped: this.timeStopped(),
      createActionContext: () => this.neutralMobActionContext(),
    });
  }

  private removeInactiveNeutralMobs(): void {
    this.neutralMobManager.removeInactive();
  }

  private stepPoints(): void {
    this.pointManager.step({
      collectors: [this.playerFighter, this.targetFighter],
      timeStopped: this.timeStopped(),
    });
  }

  private dropPointFromMob(mob: NeutralMobState): void {
    this.pointManager.dropPointFromMob(this.frame, mob);
  }

  private flushDeferredSpawns(): void {
    for (const spawn of this.pendingSpawns) {
      spawn();
    }
    this.pendingSpawns = [];
  }

  private spawnClearRingEntity(params: {
    readonly owner: FighterKey;
    readonly x: number;
    readonly y: number;
    readonly radius: number;
    readonly duration: number;
    readonly followsOwner?: boolean;
  }): void {
    this.clearRingManager.spawn({
      owner: params.owner,
      x: params.x,
      y: params.y,
      radius: params.radius,
      frame: this.frame,
      duration: params.duration,
      followsOwner: params.followsOwner,
    });
    this.stepClearRings(this.projectiles);
  }

  private stepClearRings(
    projectiles: ProjectileState[] = this.projectiles,
  ): void {
    this.clearRingManager.step({
      frame: this.frame,
      projectiles,
      fighters: {
        Player1: this.player,
        Player2: this.target,
        Neutral: undefined,
      },
      rules: this.rules,
    });
  }

  private timeStopped(): boolean {
    return this.player.timeStopUntil > 0 || this.target.timeStopUntil > 0;
  }

  private capturePreviousFighterState(): void {
    for (const fighter of [this.player, this.target]) {
      fighter.previousX = fighter.x;
      fighter.previousY = fighter.y;
      fighter.previousFacing = fighter.facing;
    }
  }

  private resolveProjectileClashes(): void {
    const masters = this.projectiles.filter(
      (projectile) =>
        projectile.kind === "spark" &&
        projectile.height >= 36 &&
        projectile.damage >= 10 &&
        this.frame >= projectile.pausedUntil,
    );
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
        return !masters.some(
          (master) =>
            this.rules.canProjectileClearProjectile(
              master.owner,
              projectile.owner,
            ) &&
            hitsBeam(master, projectile.x, projectile.y),
        );
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

  private currentHitTargets(): readonly ProjectileHitTarget[] {
    return [
      {
        key: this.player.key,
        x: this.player.x,
        y: this.player.y,
        hitRadius: fighterHitRadius(this.player),
      },
      {
        key: this.target.key,
        x: this.target.x,
        y: this.target.y,
        hitRadius: fighterHitRadius(this.target),
      },
      ...this.neutralMobManager.hitTargets(),
    ];
  }
}

function fighterHitRadius(fighter: FighterState): number {
  return PLAYER_CORE_RADIUS * fighter.hitCircleRadiusMultiplier;
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

function hitsBeam(beam: ProjectileState, x: number, y: number): boolean {
  const fpDx = fp.sub(fp.fromFloat(x), fp.fromFloat(beam.x));
  const fpDy = fp.sub(fp.fromFloat(y), fp.fromFloat(beam.y));
  const fpAngle = fp.fromFloat(beam.angle);
  const fpCos = fp.cos(fpAngle);
  const fpSin = fp.sin(fpAngle);

  const fpForward = fp.add(fp.mul(fpDx, fpCos), fp.mul(fpDy, fpSin));
  const fpSide = fp.abs(
    fp.add(fp.mul(fp.negate(fpDx), fpSin), fp.mul(fpDy, fpCos)),
  );

  if (!Number.isFinite(beam.width)) {
    return (
      fp.gte(fpForward, fp.fromInt(0)) &&
      fp.lte(fpSide, fp.div(fp.fromFloat(beam.height), fp.fromInt(2)))
    );
  }
  return (
    fp.lte(
      fp.abs(fpForward),
      fp.div(fp.fromFloat(beam.width), fp.fromInt(2)),
    ) && fp.lte(fpSide, fp.div(fp.fromFloat(beam.height), fp.fromInt(2)))
  );
}

function loadoutCards(loadout: FighterLoadout) {
  const ids = new Set(loadout.cardIds ?? []);
  if (loadout.activeCardId) {
    ids.add(loadout.activeCardId);
  }
  return Array.from(ids).map((id) => getAbilityCard(id));
}

