import {
  DEFAULT_ARENA_BOUNDS,
  PLAYER_CORE_RADIUS,
  PLAYER_SPAWN,
  TARGET_SPAWN,
  COLLABORATE_MOB_SCORE_VALUES,
  COLLABORATE_MONEY_PICKUP_SCORE_VALUES,
  COLLABORATE_POINT_PICKUP_SCORE_VALUES,
  createDefaultCollaborateExtraState,
  type MobState,
  type ProjectileCollisionContext,
  type ArenaBounds,
  type CollaborateExtraState,
} from "@repo/types";

import { getAbilityCard, getCharacter } from "../content";
import type { BattleLoadouts, FighterLoadout } from "../loadout";
import type { BattleInputState, BattleRoomMode } from "@repo/types";
import type {
  BattleOutputState,
  BattleResult,
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
import { ProjectileSystem, type ProjectileHitTarget } from "./projectile";
import {
  createBattleModelSnapshot,
  cloneCollaborateExtra,
  restoreEffectSnapshot,
  restoreFighterSnapshot,
  restoreProjectileSnapshot,
  type BattleModelSnapshot,
} from "./snapshot";
import { TickerManager } from "./ticker-manager";
import { ClearRingManager } from "./manager/clear-ring-manager";
import { NeutralMobManager } from "./manager/neutral-mob-manager";
import { clampPointCount, PointManager } from "./manager/point-manager";
import { ActiveCardCooldownManager } from "./manager/active-card-cooldown-manager";
import { BattleSizeManager } from "./size-manager";
import { clampCollaborateCurrency } from "./utils/currency";
import { hitsBeam as computeBeamHit } from "./utils/geometry";
import {
  beginCollaborateTransitionState,
  processCollaborateTransitionSync as processCollaborateTransitionSyncState,
  processCollaborateShopInputs as processCollaborateShopInputState,
  recoverDeadCollaborateShopPlayers as recoverDeadCollaborateShopPlayerState,
  resetCollaborateShopActiveCards as resetCollaborateShopActiveCardState,
} from "./collaborate-shop";
import { processFighterActions as processFighterControllerActions } from "./controller";
import { resolveProjectileGraze, resolveProjectileHit } from "./referee";
import {
  BattleFramePipeline,
  type BattleFramePipelineContext,
  type BattleFrameInputPair,
} from "./frame-pipeline";
import { createBattleFrameBranchManagers } from "./frame-branch-manager";
import { BattleActionContextManager } from "./action-context-manager";

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
  result: BattleResult = "running";
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
  readonly pointManager: PointManager;
  readonly clearRingManager = new ClearRingManager();
  private readonly projectileSystem: ProjectileSystem;
  private readonly effectSystem = new EffectSystem();
  private readonly ticker = new TickerManager();
  private readonly framePipeline: BattleFramePipeline;
  private readonly actionContextManager: BattleActionContextManager;
  private readonly activeCardCooldowns = new ActiveCardCooldownManager(
    this.ticker,
  );
  private readonly playerInitPoint: number;
  private readonly opponentInitPoint: number;
  private readonly playerInitMoney: number;
  private readonly opponentInitMoney: number;
  private readonly seed: number;
  private readonly arenaBounds: ArenaBounds;
  private readonly battleMode: BattleRoomMode;
  private collaborateExtra: CollaborateExtraState | undefined;
  private readonly sizeManager: BattleSizeManager;
  private readonly playerSpawn: { readonly x: number; readonly y: number };
  private readonly targetSpawn: { readonly x: number; readonly y: number };
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
      readonly arenaBounds?: ArenaBounds;
      readonly playerSpawn?: { readonly x: number; readonly y: number };
      readonly targetSpawn?: { readonly x: number; readonly y: number };
      readonly playerInitPoint?: number;
      readonly opponentInitPoint?: number;
      readonly playerInitMoney?: number;
      readonly opponentInitMoney?: number;
      readonly seed?: number;
      readonly debugCooperate?: {
        readonly jump?: {
          readonly nodeIndex: number;
          readonly currentWaveId: string;
          readonly transitionTarget?: "elite" | "boss";
        };
      };
      readonly ai?: {
        readonly smartDurationSeconds?: number;
        readonly dumbRampSeconds?: number;
      };
    } = {},
  ) {
    this.loadouts = loadouts;
    const battleMode = params.battleMode ?? "versus";
    this.battleMode = battleMode;
    this.collaborateExtra =
      battleMode === "collaborate"
        ? createDefaultCollaborateExtraState(0, params.seed ?? 1)
        : undefined;
    this.rules = createBattleRules(battleMode);
    this.sizeManager = new BattleSizeManager({
      battleMode,
      arenaBounds: params.arenaBounds ?? DEFAULT_ARENA_BOUNDS,
    });
    this.arenaBounds = this.sizeManager.arenaBounds;
    this.playerSpawn = params.playerSpawn ?? PLAYER_SPAWN;
    this.targetSpawn = params.targetSpawn ?? TARGET_SPAWN;
    this.currentAimByFighter.Player1 = {
      x: this.targetSpawn.x,
      y: this.targetSpawn.y,
    };
    this.currentAimByFighter.Player2 = {
      x: this.playerSpawn.x,
      y: this.playerSpawn.y,
    };
    this.pointManager = new PointManager(this.arenaBounds, (award) =>
      this.handleCollectibleAward(award),
    );
    this.projectileSystem = new ProjectileSystem(this.sizeManager);
    this.playerInitPoint = clampPointCount(params.playerInitPoint ?? 0);
    this.opponentInitPoint = clampPointCount(params.opponentInitPoint ?? 0);
    this.playerInitMoney = clampCollaborateCurrency(
      params.playerInitMoney ?? 0,
    );
    this.opponentInitMoney = clampCollaborateCurrency(
      params.opponentInitMoney ?? 0,
    );
    this.seed = params.seed ?? 1;
    this.playerFighter = new BattleFighter(
      "Player1",
      getCharacter(loadouts.player.primaryCharacterId),
      getCharacter(loadouts.player.alternateCharacterId),
      this.playerSpawn.x,
      this.playerSpawn.y,
      loadouts.player.activeCardId
        ? getAbilityCard(loadouts.player.activeCardId)
        : undefined,
      loadoutCards(loadouts.player),
      loadouts.player.storyModeOverride,
      this.arenaBounds,
    );
    this.targetFighter = new BattleFighter(
      "Player2",
      getCharacter(loadouts.target.primaryCharacterId),
      getCharacter(loadouts.target.alternateCharacterId),
      this.targetSpawn.x,
      this.targetSpawn.y,
      loadouts.target.activeCardId
        ? getAbilityCard(loadouts.target.activeCardId)
        : undefined,
      loadoutCards(loadouts.target),
      loadouts.target.storyModeOverride,
      this.arenaBounds,
    );
    this.applyInitialPoints();
    this.applyInitialCollaborateMoney();
    this.cpuPlayer = params.enableCpuTarget
      ? new CpuPlayer(params.ai)
      : undefined;
    const mobSpawner =
      params.neutralMobSpawner === undefined
        ? (resolveMobSpawner("default-a") ?? undefined)
        : (params.neutralMobSpawner ?? undefined);
    this.neutralMobManager = new NeutralMobManager(
      mobSpawner,
      this.arenaBounds,
    );
    this.applyDebugCooperateJump(params.debugCooperate?.jump);
    this.actionContextManager = new BattleActionContextManager({
      arenaBounds: this.arenaBounds,
      projectiles: this.projectiles,
      effects: this.effects,
      stats: this.stats,
      clearRingManager: this.clearRingManager,
      projectileSystem: this.projectileSystem,
      effectSystem: this.effectSystem,
      ticker: this.ticker,
      rules: this.rules,
      neutralMobs: this.neutralMobManager.mobs,
      getFrame: () => this.frame,
      getPlayer: () => this.player,
      getTarget: () => this.target,
      getBattleMode: () => this.battleMode,
      getEnemyTargets: (owner) => this.currentEnemyTargetsFor(owner),
      getAim: (owner) => this.currentAimByFighter[owner],
      allocateMobId: () => this.neutralMobManager.allocateNeutralMobId(),
      spawnMob: (mob) => this.neutralMobManager.addNeutralMob(mob),
      consumeAim: () => {
        this.aimConsumedThisFrame = true;
      },
      deferSpawn: (spawn) => {
        this.pendingSpawns.push(spawn);
      },
    });
    const frameContext: BattleFramePipelineContext = {
      ensurePhysicsReady: () => this.ensurePhysicsReady(),
      beginFrame: () => this.beginFrame(),
      processCollaborateTransitionSync: (inputPair) =>
        this.processCollaborateTransitionSync(
          inputPair.firstInput,
          inputPair.secondInput,
          inputPair.firstIsPlayer,
        ),
      isCollaborateShopOpen: () => this.collaborateExtra?.shop.open === true,
      processCollaborateShopInputs: (inputPair) =>
        this.processCollaborateShopInputs(
          inputPair.firstInput,
          inputPair.secondInput,
          inputPair.firstIsPlayer,
        ),
      stepMobSpawner: () => this.stepMobSpawner(),
      beginRunningFrame: () => this.beginRunningFrame(),
      processFighterActions: (inputPair) =>
        this.processFighterActionPair(inputPair),
      stepNeutralMobs: () => this.stepNeutralMobs(),
      resolveProjectileClashes: () => this.resolveProjectileClashes(),
      stepProjectiles: () => this.stepProjectiles(),
      removeInactiveNeutralMobs: () => this.removeInactiveNeutralMobs(),
      stepPoints: () => this.stepPoints(),
      syncPointBodies: () => this.syncPointBodies(),
      flushDeferredSpawns: () => this.flushDeferredSpawns(),
      stepEffects: () => this.stepEffects(),
    };
    this.framePipeline = new BattleFramePipeline(
      frameContext,
      createBattleFrameBranchManagers(frameContext),
    );
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
    this.result = "running";
    this.collaborateExtra =
      this.battleMode === "collaborate"
        ? createDefaultCollaborateExtraState(0, this.seed)
        : undefined;
    this.physics?.reset();
    this.cpuPlayer?.reset();
    this.playerFighter.reset(
      getCharacter(this.loadouts.player.primaryCharacterId),
      getCharacter(this.loadouts.player.alternateCharacterId),
      this.playerSpawn.x,
      this.playerSpawn.y,
      this.loadouts.player.activeCardId
        ? getAbilityCard(this.loadouts.player.activeCardId)
        : undefined,
      loadoutCards(this.loadouts.player),
      this.loadouts.player.storyModeOverride,
    );
    this.targetFighter.reset(
      getCharacter(this.loadouts.target.primaryCharacterId),
      getCharacter(this.loadouts.target.alternateCharacterId),
      this.targetSpawn.x,
      this.targetSpawn.y,
      this.loadouts.target.activeCardId
        ? getAbilityCard(this.loadouts.target.activeCardId)
        : undefined,
      loadoutCards(this.loadouts.target),
      this.loadouts.target.storyModeOverride,
    );
    this.applyInitialPoints();
    this.applyInitialCollaborateMoney();
    this.applyDebugCooperateJump(undefined);
  }

  private applyInitialPoints(): void {
    this.pointManager.setPointCount(this.player, this.playerInitPoint);
    this.pointManager.setPointCount(this.target, this.opponentInitPoint);
  }

  private applyInitialCollaborateMoney(): void {
    if (!this.collaborateExtra) return;
    this.collaborateExtra = {
      ...this.collaborateExtra,
      moneyByPlayerId: {
        ...this.collaborateExtra.moneyByPlayerId,
        Player1: this.playerInitMoney,
        Player2: this.opponentInitMoney,
      },
    };
  }

  private applyDebugCooperateJump(
    jump:
      | {
        readonly nodeIndex: number;
        readonly currentWaveId: string;
        readonly transitionTarget?: "elite" | "boss";
      }
      | undefined,
  ): void {
    if (!jump || this.battleMode !== "collaborate" || !this.collaborateExtra) {
      return;
    }
    const nodeIndex = Math.max(0, Math.trunc(jump.nodeIndex));
    this.neutralMobManager.restoreSpawner({
      spawnerId: "example-collaborate-mob-spawner",
      nodeIndex,
      phase: jump.transitionTarget ? "transition_sync" : "running",
      shopIndex: 0,
      waveStartFrame: 0,
      nextWaveAllowedFrame: 0,
      forceNextWaveFrame: 0,
      spawnedMemberKeys: [],
    });
    this.collaborateExtra = {
      ...this.collaborateExtra,
      state: jump.transitionTarget ? "transition_sync" : "running",
      pendingTransitionTarget: jump.transitionTarget ?? null,
      transitionType: jump.transitionTarget ? "manual" : null,
      transitionReadyFrame: this.frame,
      player1TransitionReady: false,
      player2TransitionReady: false,
      wave: {
        waveIndex: nodeIndex,
        currentWaveId: jump.currentWaveId,
        waveStartFrame: this.frame,
        nextWaveAllowedFrame: this.frame,
        forceNextWaveFrame: this.frame,
      },
    };
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
    this.framePipeline.advance({ firstInput, secondInput, firstIsPlayer });
  }

  private ensurePhysicsReady(): void {
    if (!this.physics?.isReady()) {
      throw new Error("BattleModel requires Rapier physics before stepping");
    }
  }

  private beginFrame(): void {
    this.capturePreviousFighterState();
    this.frame += 1;
    this.aimConsumedThisFrame = false;
    this.lastTargetInput = null;
    this.lastPlayerInput = null;
    this.ticker.setCurrentFrame(this.frame);
    this.stats.elapsedTicks += 1;
  }

  private beginRunningFrame(): boolean {
    this.pendingSpawns = [];
    this.playerFighter.tickTimers();
    this.targetFighter.tickTimers();
    this.activeCardCooldowns.sync([this.player, this.target]);
    return this.gameOver;
  }

  private processFighterActionPair(inputPair: BattleFrameInputPair): void {
    if (inputPair.firstIsPlayer) {
      this.processFighterActions(this.playerFighter, inputPair.firstInput);
      this.processFighterActions(this.targetFighter, inputPair.secondInput);
      if (inputPair.firstInput !== undefined) {
        this.lastPlayerInput = inputPair.firstInput;
      }
      if (inputPair.secondInput !== undefined) {
        this.lastTargetInput = inputPair.secondInput;
      }
    } else {
      this.processFighterActions(this.targetFighter, inputPair.firstInput);
      this.processFighterActions(this.playerFighter, inputPair.secondInput);
      if (inputPair.firstInput !== undefined) {
        this.lastTargetInput = inputPair.firstInput;
      }
      if (inputPair.secondInput !== undefined) {
        this.lastPlayerInput = inputPair.secondInput;
      }
    }
  }

  private stepProjectiles(): void {
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
      clearProjectiles: (projectiles) =>
        this.actionContextManager.stepClearRings(projectiles),
    });
    if (projAimConsumed.value) {
      this.aimConsumedThisFrame = true;
    }
  }

  private syncPointBodies(): void {
    this.physics?.syncPointBodies(this.pointManager.points);
  }

  private stepEffects(): void {
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
      result: this.result,
      player: this.player,
      target: this.target,
      points: this.points,
      neutralMobs: this.neutralMobManager.states(),
      projectiles: this.projectiles,
      effects: this.effects,
      shields: this.currentShields(),
      stats: this.stats,
      collaborateExtra: this.collaborateExtra
        ? cloneCollaborateExtra(this.collaborateExtra)
        : undefined,
    };
  }

  serialize(): BattleModelSnapshot {
    return createBattleModelSnapshot({
      frame: this.frame,
      gameOver: this.gameOver,
      result: this.result,
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
      collaborateExtra: this.collaborateExtra,
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
    this.result =
      snapshot.result ??
      (snapshot.gameOver ? this.legacyResultFromSnapshot(snapshot) : "running");
    this.collaborateExtra =
      this.battleMode === "collaborate"
        ? cloneCollaborateExtra(
          snapshot.collaborateExtra ??
          createDefaultCollaborateExtraState(snapshot.frame, 1),
        )
        : undefined;
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

  beginCollaborateTransition(
    target: "elite" | "boss" | "shop",
    type: "auto" | "manual",
  ): void {
    this.collaborateExtra = beginCollaborateTransitionState({
      extra: this.collaborateExtra,
      frame: this.frame,
      target,
      type,
    });
  }

  private clearCollaborateTransitionHazards(): void {
    this.projectiles.splice(
      0,
      this.projectiles.length,
      ...this.projectiles.filter(
        (projectile) => projectile.owner !== "Neutral",
      ),
    );
    this.neutralMobManager.clearActiveMobs();
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
    processFighterControllerActions(
      {
        frame: this.frame,
        gameOver: this.gameOver,
        player: this.player,
        target: this.target,
        targetFighter: this.targetFighter,
        projectiles: this.projectiles,
        points: this.points,
        arenaBounds: this.arenaBounds,
        cpuPlayer: this.cpuPlayer,
        neutralMobManager: this.neutralMobManager,
        currentAimByFighter: this.currentAimByFighter,
        createActionContext: (self) =>
          this.actionContextManager.createCharacterActionContext(self),
        processActiveCardSwitch: (battleFighter, activeCardSwitchId) =>
          this.processActiveCardSwitch(battleFighter, activeCardSwitchId),
        registerActiveCardUse: (state) => {
          this.activeCardCooldowns.register(state, this.frame);
        },
        pauseActiveCardCooldowns: (ticks) => {
          this.activeCardCooldowns.pause([this.player, this.target], ticks);
        },
        consumeAim: () => {
          this.aimConsumedThisFrame = true;
        },
        setLastTargetInput: (targetInput) => {
          this.lastTargetInput = targetInput;
        },
      },
      fighter,
      input,
    );
  }

  private processCollaborateTransitionSync(
    firstInput: BattleInputState,
    secondInput: BattleInputState | undefined,
    firstIsPlayer: boolean,
  ): boolean {
    const result = processCollaborateTransitionSyncState({
      extra: this.collaborateExtra,
      frame: this.frame,
      firstInput,
      secondInput,
      firstIsPlayer,
      seed: this.seed,
      playerFighter: this.playerFighter,
      targetFighter: this.targetFighter,
    });
    this.collaborateExtra = result.extra;
    if (result.shouldClearHazards) {
      this.clearCollaborateTransitionHazards();
    }
    if (result.openedShop) {
      this.resetCollaborateShopActiveCards();
      this.recoverDeadCollaborateShopPlayers();
    }
    return result.handled;
  }

  private resetCollaborateShopActiveCards(): void {
    resetCollaborateShopActiveCardState({
      frame: this.frame,
      playerFighter: this.playerFighter,
      targetFighter: this.targetFighter,
      registerActiveCardUse: (fighter) => {
        this.activeCardCooldowns.register(fighter.state, this.frame);
      },
    });
  }

  private processCollaborateShopInputs(
    firstInput: BattleInputState,
    secondInput: BattleInputState | undefined,
    firstIsPlayer: boolean,
  ): void {
    this.collaborateExtra = processCollaborateShopInputState({
      extra: this.collaborateExtra,
      firstInput,
      secondInput,
      firstIsPlayer,
      playerFighter: this.playerFighter,
      targetFighter: this.targetFighter,
      pointManager: this.pointManager,
      frame: this.frame,
      processActiveCardSwitch: (fighter, activeCardSwitchId) =>
        this.processActiveCardSwitch(fighter, activeCardSwitchId),
      isFighterDefeated: (fighter) => this.isFighterDefeated(fighter.state),
      registerActiveCardUse: (fighter) => {
        this.activeCardCooldowns.register(fighter.state, this.frame);
      },
    });
  }

  private processActiveCardSwitch(
    fighter: BattleFighter,
    activeCardSwitchId: string | undefined,
  ): void {
    if (!activeCardSwitchId) return;
    const card = fighter.state.abilityCards.find(
      (candidate) => candidate.id === activeCardSwitchId,
    );
    if (!card || card.kind !== "active") return;
    if (fighter.state.activeCard?.id === card.id) return;
    fighter.setActiveAbilityCard(card);
    this.activeCardCooldowns.register(fighter.state, this.frame);
  }

  private recoverDeadCollaborateShopPlayers(): void {
    this.collaborateExtra = recoverDeadCollaborateShopPlayerState({
      extra: this.collaborateExtra,
      playerFighter: this.playerFighter,
      targetFighter: this.targetFighter,
      isFighterDefeated: (fighter) => this.isFighterDefeated(fighter.state),
    });
  }

  private onProjectileHit(
    ctx: ProjectileCollisionContext<
      ProjectileState,
      ProjectileHitTarget,
      FighterKey
    >,
  ): boolean {
    return resolveProjectileHit({
      ctx,
      rules: this.rules,
      player: this.player,
      target: this.target,
      playerFighter: this.playerFighter,
      targetFighter: this.targetFighter,
      neutralMobManager: this.neutralMobManager,
      stats: this.stats,
      frame: this.frame,
      createActionContext: (fighter) =>
        this.actionContextManager.createCharacterActionContext(fighter),
      handleNeutralMobKilled: (mob, source) =>
        this.handleNeutralMobKilled(mob, source),
      cancelTimeStop: (fighter) => this.cancelTimeStop(fighter),
      handleFighterDefeated: (fighter) => this.handleFighterDefeated(fighter),
    });
  }

  private handleFighterDefeated(fighter: FighterState): void {
    if (this.battleMode !== "collaborate") {
      this.finishBattle(
        fighter.key === "Player1" ? "versus_player2" : "versus_player1",
      );
      return;
    }

    fighter.deadUntil = Number.MAX_SAFE_INTEGER;
    fighter.actionLockedUntil = Number.MAX_SAFE_INTEGER;
    fighter.nonFireActionLockedUntil = Number.MAX_SAFE_INTEGER;
    fighter.movementLockedUntil = Number.MAX_SAFE_INTEGER;
    fighter.switchLockedUntil = Number.MAX_SAFE_INTEGER;
    fighter.reloadRemaining = 0;

    this.evaluateCollaborateDefeat();
  }

  private evaluateCollaborateDefeat(): void {
    if (
      this.battleMode !== "collaborate" ||
      this.collaborateExtra?.bossDefeated
    ) {
      return;
    }
    if (
      this.isFighterDefeated(this.player) &&
      this.isFighterDefeated(this.target)
    ) {
      this.updateCollaborateResult("defeat");
      this.finishBattle("collaborate_defeat");
    }
  }

  private evaluateCollaborateVictory(): void {
    if (
      this.battleMode !== "collaborate" ||
      !this.collaborateExtra?.bossDefeated
    ) {
      return;
    }
    this.updateCollaborateResult("victory");
    this.finishBattle("collaborate_victory");
  }

  private updateCollaborateResult(state: "victory" | "defeat"): void {
    if (!this.collaborateExtra) return;
    if (this.collaborateExtra.state === state) return;
    this.collaborateExtra = {
      ...this.collaborateExtra,
      state,
    };
  }

  private finishBattle(result: BattleResult): void {
    this.gameOver = true;
    this.result = result;
  }

  private isFighterDefeated(fighter: FighterState): boolean {
    return fighter.lives <= 0 && fighter.deadUntil > 0;
  }

  private legacyResultFromSnapshot(
    snapshot: BattleModelSnapshot,
  ): BattleResult {
    if (this.battleMode === "collaborate") {
      return snapshot.collaborateExtra?.state === "victory"
        ? "collaborate_victory"
        : "collaborate_defeat";
    }
    return snapshot.target.deaths > snapshot.player.deaths
      ? "versus_player1"
      : "versus_player2";
  }

  private onProjectileGraze(
    ctx: ProjectileCollisionContext<
      ProjectileState,
      ProjectileHitTarget,
      FighterKey
    >,
  ): boolean {
    return resolveProjectileGraze({
      ctx,
      rules: this.rules,
      player: this.player,
      target: this.target,
      playerFighter: this.playerFighter,
      targetFighter: this.targetFighter,
      seed: this.seed,
      addCollaborateScore: (key, value) => this.addCollaborateScore(key, value),
    });
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

  private stepMobSpawner(): void {
    this.neutralMobManager.stepSpawner({
      frame: this.frame,
      player: this.player,
      target: this.target,
      arenaBounds: this.arenaBounds,
      timeStopped: this.timeStopped(),
      collaborateExtra: this.collaborateExtra,
      updateCollaborateExtra: (updater) => {
        if (!this.collaborateExtra) return;
        this.collaborateExtra = updater(this.collaborateExtra);
      },
      beginCollaborateTransition: (target, type) => {
        this.beginCollaborateTransition(target, type);
      },
    });
  }

  private stepNeutralMobs(): void {
    this.neutralMobManager.stepMobs({
      frame: this.frame,
      timeStopped:
        this.timeStopped() || this.collaborateExtra?.shop.open === true,
      player: this.player,
      target: this.target,
      rules: this.rules,
      createActionContext: (mob) =>
        this.actionContextManager.createNeutralMobActionContext(mob),
      onSpecialMobDefeated: (mob) => this.handleNeutralMobKilled(mob),
      onPhysicalHit: ({ mob, victim }) => {
        this.onProjectileHit({
          projectile: { damage: 1 } as ProjectileState,
          owner: mob.key,
          victim: {
            key: victim.key,
            x: victim.x,
            y: victim.y,
            hitRadius: fighterHitRadius(victim),
          },
          damage: 1,
        });
      },
      onPhysicalMobKilled: (mob, source) =>
        this.handleNeutralMobKilled(mob, source),
    });
  }

  private removeInactiveNeutralMobs(): void {
    this.neutralMobManager.removeInactive();
    this.evaluateCollaborateVictory();
  }

  private stepPoints(): void {
    this.pointManager.step({
      collectors: [this.playerFighter, this.targetFighter],
      timeStopped:
        this.timeStopped() || this.collaborateExtra?.shop.open === true,
    });
  }

  private dropPointFromMob(mob: MobState): void {
    this.pointManager.dropPointFromMob(this.frame, mob);
  }

  private handleNeutralMobKilled(
    mob: MobState,
    source?: FighterKey | null,
  ): void {
    this.dropPointFromMob(mob);
    if (source === "Player1" || source === "Player2") {
      this.addCollaborateScore(
        source,
        COLLABORATE_MOB_SCORE_VALUES[mob.class ?? "minion"],
      );
    }
    if (this.battleMode !== "collaborate" || mob.class !== "boss") {
      return;
    }
    if (!this.collaborateExtra?.bossDefeated) {
      this.collaborateExtra = this.collaborateExtra
        ? { ...this.collaborateExtra, bossDefeated: true }
        : this.collaborateExtra;
    }
    this.evaluateCollaborateVictory();
  }

  private handleCollectibleAward(award: {
    readonly collectorKey: FighterKey;
    readonly point: PointState;
  }): void {
    if (
      this.battleMode !== "collaborate" ||
      !this.collaborateExtra ||
      (award.collectorKey !== "Player1" && award.collectorKey !== "Player2")
    ) {
      return;
    }
    const score =
      award.point.rewardKind === "money"
        ? COLLABORATE_MONEY_PICKUP_SCORE_VALUES[award.point.rewardSize]
        : COLLABORATE_POINT_PICKUP_SCORE_VALUES[award.point.rewardSize];
    this.addCollaborateScore(award.collectorKey, score);
    if (award.point.rewardKind === "money") {
      this.addCollaborateMoney(award.collectorKey, award.point.value);
    }
  }

  private addCollaborateMoney(key: "Player1" | "Player2", value: number): void {
    if (!this.collaborateExtra) return;
    this.collaborateExtra = {
      ...this.collaborateExtra,
      moneyByPlayerId: {
        ...this.collaborateExtra.moneyByPlayerId,
        [key]: clampCollaborateCurrency(
          this.collaborateExtra.moneyByPlayerId[key] + value,
        ),
      },
    };
  }

  private addCollaborateScore(key: "Player1" | "Player2", value: number): void {
    if (!this.collaborateExtra || value <= 0) return;
    this.collaborateExtra = {
      ...this.collaborateExtra,
      scoreByPlayerId: {
        ...this.collaborateExtra.scoreByPlayerId,
        [key]: clampCollaborateCurrency(
          this.collaborateExtra.scoreByPlayerId[key] + value,
        ),
      },
    };
  }

  private flushDeferredSpawns(): void {
    for (const spawn of this.pendingSpawns) {
      spawn();
    }
    this.pendingSpawns = [];
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
            ) && computeBeamHit(master, projectile.x, projectile.y),
        );
      }),
    );
  }

  private currentShields(): readonly ShieldState[] {
    const shields: ShieldState[] = [];
    if (this.player.deadUntil <= 0) {
      shields.push(...this.playerFighter.collectShields(this.frame));
    }
    if (this.target.deadUntil <= 0) {
      shields.push(...this.targetFighter.collectShields(this.frame));
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

  private currentEnemyTargetsFor(
    owner: FighterKey,
  ): readonly ProjectileHitTarget[] {
    return this.currentHitTargets().filter((target) =>
      this.rules.canProjectileDamageTarget(owner, target.key),
    );
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

function loadoutCards(loadout: FighterLoadout) {
  const ids = new Set(loadout.cardIds ?? []);
  if (loadout.activeCardId) {
    ids.add(loadout.activeCardId);
  }
  return Array.from(ids).map((id) => getAbilityCard(id));
}
