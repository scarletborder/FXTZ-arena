import { fp } from "@shaisrc/fixed-point";

import {
  PLAYER_CORE_RADIUS,
  ENEMY_PROJECTILE_GRAZE_POINT_REWARD,
  NEUTRAL_PROJECTILE_GRAZE_POINT_REWARD,
  PLAYER_SPAWN,
  TARGET_SPAWN,
  type NeutralMob,
  type NeutralMobActionContext,
  type NeutralMobState,
  type ProjectileCollisionContext,
} from "@repo/types";

import { getAbilityCard, getCharacter } from "../content";
import type { BattleLoadouts, FighterLoadout } from "../loadout";
import type { BattleInputState } from "@repo/types";
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
import type { NeutralMobSpawner, NeutralMobSpawnerState } from "@repo/content";
import { resolveMobSpawner } from "@repo/content";
import { BattleFighter } from "./battle-fighter";
import { POINT_COUNT_MAX } from "../constants";
import { CpuPlayer } from "../aicpu";
import { EffectSystem } from "./effects";
import {
  createClearRingState,
  stepClearRings,
  type ClearRingState,
} from "./entities/clear-ring";
import { hashBattleModel, hashToHex } from "./hash";
import { BattlePhysics } from "./physics-adapter";
import {
  createPointState,
  POINT_COLLECT_TICKS,
  pointIsOutsideArena,
  pointVelocityFromFrame,
} from "./points";
import {
  ProjectileSystem,
  type BulletProjectileParams,
  type LaserProjectileParams,
  type ProjectileHitTarget,
} from "./projectile";
import {
  createBattleModelSnapshot,
  restoreEffectSnapshot,
  restoreClearRingSnapshot,
  restoreFighterSnapshot,
  restoreProjectileSnapshot,
  type BattleModelSnapshot,
} from "./snapshot";
import type { CharacterActionContext } from "@repo/content";
import { fpClamp, fpAtan2, fpHypotFp } from "@repo/content";

export class BattleModel {
  readonly projectiles: ProjectileState[] = [];
  readonly effects: EffectState[] = [];
  readonly clearRings: ClearRingState[] = [];
  readonly points: PointState[] = [];
  readonly stats: TrainingStats = {
    shots: 0,
    hits: 0,
    bombUses: 0,
    damage: 0,
    elapsedTicks: 0,
  };
  frame = 0;
  gameOver = false;
  private readonly neutralMobs: NeutralMob<
    NeutralMobState,
    BulletProjectileParams,
    LaserProjectileParams
  >[] = [];
  private nextNeutralMobId = 1;
  private nextPointId = 1;
  private nextClearRingId = 1;
  private readonly loadouts: BattleLoadouts;
  private readonly projectileSystem = new ProjectileSystem();
  private readonly effectSystem = new EffectSystem();
  private readonly playerFighter: BattleFighter;
  private readonly targetFighter: BattleFighter;
  private readonly cpuPlayer: CpuPlayer | undefined;
  private readonly mobSpawner: NeutralMobSpawner | undefined;
  private physics: BattlePhysics | undefined;
  private pendingSpawns: Array<() => void> = [];

  constructor(
    loadouts: BattleLoadouts = DEFAULT_BATTLE_LOADOUTS,
    params: {
      readonly enableCpuTarget?: boolean;
      readonly neutralMobSpawner?: NeutralMobSpawner | null;
    } = {},
  ) {
    this.loadouts = loadouts;
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
    );
    this.cpuPlayer = params.enableCpuTarget ? new CpuPlayer() : undefined;
    this.mobSpawner =
      params.neutralMobSpawner === undefined
        ? (resolveMobSpawner("default-a") ?? undefined)
        : (params.neutralMobSpawner ?? undefined);
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
    this.mobSpawner?.reset();
    this.neutralMobs.length = 0;
    this.nextNeutralMobId = 1;
    this.points.length = 0;
    this.nextPointId = 1;
    this.clearRings.length = 0;
    this.nextClearRingId = 1;
    this.projectiles.length = 0;
    this.effects.length = 0;
    this.stats.shots = 0;
    this.stats.hits = 0;
    this.stats.bombUses = 0;
    this.stats.damage = 0;
    this.stats.elapsedTicks = 0;
    this.frame = 0;
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
    );
  }

  allocateNeutralMobId(): number {
    return this.nextNeutralMobId++;
  }

  addNeutralMob(
    mob: NeutralMob<
      NeutralMobState,
      BulletProjectileParams,
      LaserProjectileParams
    >,
  ): void {
    if (this.neutralMobs.some((existing) => existing.id === mob.id)) {
      throw new Error(`Duplicate neutral mob id: ${mob.id}`);
    }
    this.neutralMobs.push(mob);
    this.nextNeutralMobId = Math.max(this.nextNeutralMobId, mob.id + 1);
    this.sortNeutralMobs();
  }

  neutralMobStates(): readonly NeutralMobState[] {
    return this.neutralMobs.map((mob) => mob.state);
  }

  getNextNeutralMobId(): number {
    return this.nextNeutralMobId;
  }

  allocatePointId(): number {
    return this.nextPointId++;
  }

  addPoint(point: PointState): void {
    if (this.points.some((existing) => existing.id === point.id)) {
      throw new Error(`Duplicate point id: ${point.id}`);
    }
    this.points.push(point);
    this.nextPointId = Math.max(this.nextPointId, point.id + 1);
    this.sortPoints();
  }

  pointStates(): readonly PointState[] {
    return this.points;
  }

  setPlayerPointCount(pointCount: number): void {
    this.player.pointCount = clampPointCount(pointCount);
  }

  getNextPointId(): number {
    return this.nextPointId;
  }

  getNextClearRingId(): number {
    return this.nextClearRingId;
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
    this.stats.elapsedTicks += 1;

    // --- Phase 1: Timer ticking (order-independent) ---
    this.pendingSpawns = [];
    this.playerFighter.tickTimers();
    this.targetFighter.tickTimers();

    if (this.gameOver) return;

    // --- Phase 2: Fighter actions in priority order ---
    if (firstIsPlayer) {
      this.processFighterActions(this.playerFighter, firstInput);
      this.processFighterActions(this.targetFighter, secondInput);
    } else {
      this.processFighterActions(this.targetFighter, firstInput);
      this.processFighterActions(this.playerFighter, secondInput);
    }
    this.stepMobSpawner();
    this.stepNeutralMobs();

    // --- Phase 3: Post-update ---
    this.resolveProjectileClashes();
    const physics = this.physics;
    this.projectileSystem.stepProjectiles({
      frame: this.frame,
      projectiles: this.projectiles,
      player: this.player,
      target: this.target,
      hitTargets: this.currentHitTargets(),
      shields: this.currentShields(),
      computeRapierHits: physics
        ? (projectiles) =>
            physics.computeCollisions(
              projectiles,
              this.player,
              this.target,
              this.currentShields(),
              this.neutralMobStates(),
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
    this.removeInactiveNeutralMobs();
    this.stepPoints();
    physics?.syncPointBodies(this.points);
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
      points: this.points,
      neutralMobs: this.neutralMobStates(),
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
      nextNeutralMobId: this.nextNeutralMobId,
      nextPointId: this.nextPointId,
      nextClearRingId: this.nextClearRingId,
      neutralMobs: this.neutralMobStates(),
      points: this.points,
      clearRings: this.clearRings,
      mobSpawner: this.mobSpawnerState(),
    });
  }

  deserialize(snapshot: BattleModelSnapshot): void {
    if (snapshot.version !== 1) {
      throw new Error(
        `Unsupported battle model snapshot version: ${snapshot.version}`,
      );
    }
    this.frame = snapshot.frame;
    this.gameOver = snapshot.gameOver;
    restoreFighterSnapshot(this.player, snapshot.player, this.frame);
    restoreFighterSnapshot(this.target, snapshot.target, this.frame);
    this.projectiles.splice(
      0,
      this.projectiles.length,
      ...snapshot.projectiles.map((projectile) =>
        restoreProjectileSnapshot(projectile, this.frame),
      ),
    );
    this.effects.splice(
      0,
      this.effects.length,
      ...snapshot.effects.map((effect) =>
        restoreEffectSnapshot(effect, this.frame),
      ),
    );
    this.points.splice(
      0,
      this.points.length,
      ...snapshot.points.map((point) => ({ ...point })),
    );
    this.clearRings.splice(
      0,
      this.clearRings.length,
      ...snapshot.clearRings.map((ring) =>
        restoreClearRingSnapshot(ring, this.frame),
      ),
    );
    this.restoreNeutralMobSnapshots(snapshot.neutralMobs);
    Object.assign(this.stats, snapshot.stats);
    this.projectileSystem.restoreNextId(
      this.projectiles,
      snapshot.nextProjectileId,
    );
    this.effectSystem.restoreNextId(this.effects, snapshot.nextEffectId);
    this.nextNeutralMobId = Math.max(
      snapshot.nextNeutralMobId,
      1 + Math.max(0, ...snapshot.neutralMobs.map((mob) => mob.id)),
    );
    this.nextPointId = Math.max(
      snapshot.nextPointId,
      1 + Math.max(0, ...snapshot.points.map((point) => point.id)),
    );
    this.nextClearRingId = Math.max(
      snapshot.nextClearRingId,
      1 + Math.max(0, ...snapshot.clearRings.map((ring) => ring.id)),
    );
    if (snapshot.mobSpawner) {
      this.mobSpawner?.restore(snapshot.mobSpawner);
    }
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
    state.facing = fpAtan2(
      fp.fromFloat(input.aimY - state.y),
      fp.fromFloat(input.aimX - state.x),
    );
    fighter.moveBy(input);
    fighter.postUpdate(this.fighterActionContext(state));
    fighter.handleReload(input.reloadPressed);

    const ctx = this.fighterActionContext(state);
    if (input.activeCardPressed) {
      fighter.useActiveCard(ctx);
    }
    if (input.bombPressed) {
      fighter.useBomb(ctx, input.aimX, input.aimY);
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
    fighter.facing = fpAtan2(
      fp.fromFloat(aiInput.aimY - fighter.y),
      fp.fromFloat(aiInput.aimX - fighter.x),
    );
    this.targetFighter.moveBy(aiInput);
    this.targetFighter.postUpdate(this.fighterActionContext(fighter));
    this.targetFighter.handleReload(aiInput.reloadPressed);

    const ctx = this.fighterActionContext(fighter);
    if (aiInput.bombPressed) {
      this.targetFighter.useBomb(ctx, aiInput.aimX, aiInput.aimY);
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
    this.targetFighter.postUpdate(this.fighterActionContext(fighter));
    if (this.frame % 72 === 0) {
      this.targetFighter.fire(
        this.fighterActionContext(fighter),
        this.player.x,
        this.player.y,
      );
    }
  }

  private onProjectileHit(
    ctx: ProjectileCollisionContext<
      ProjectileState,
      ProjectileHitTarget,
      FighterKey
    >,
  ): boolean {
    const { owner, victim } = ctx;
    if (victim.key === "Neutral") {
      const mob = this.neutralMobs.find(
        (candidate) => candidate.id === neutralMobIdFromHitTarget(victim),
      );
      const mobDamage = ctx.projectile.damage;
      if (!mob) {
        return false;
      }
      const wasActive = mob.state.active;
      const result = mob.onProjectileHit(mobDamage);
      if (result === "ignored") {
        return false;
      }
      if (wasActive && !mob.state.active) {
        mob.onDeath(owner);
        this.dropPointFromMob(mob.state);
        mob.onDeathEffect();
      }
      return true;
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
    if (owner !== "Neutral" && owner === victim.key) {
      return;
    }
    const fighter = victim.key === "Player1" ? this.player : this.target;
    if (fighter.deadUntil > 0 || fighter.grazedProjectileIds.includes(projectile.id)) {
      return;
    }
    fighter.grazedProjectileIds = [...fighter.grazedProjectileIds, projectile.id];
    fighter.pointCount = clampPointCount(
      fighter.pointCount + (owner === "Neutral"
        ? NEUTRAL_PROJECTILE_GRAZE_POINT_REWARD
        : ENEMY_PROJECTILE_GRAZE_POINT_REWARD),
    );
  }

  private cancelTimeStop(caster: FighterState): void {
    const opponent = caster.key === "Player1" ? this.target : this.player;
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
      opponent: self.key === "Player1" ? this.target : this.player,
      projectiles: this.projectiles,
      effects: this.effects,
      stats: this.stats,
      spawnBullet: (params) => {
        const spawnFrame = params.frame ?? frame;
        const owner = params.owner === "Player1" ? this.player : this.target;
        const spawnParams = {
          ...params,
          frame: spawnFrame,
          pausedUntil:
            params.pausedUntil ?? spawnFrame + owner.projectilePauseUntil,
        };
        this.pendingSpawns.push(() => {
          this.projectileSystem.spawnBullet(this.projectiles, spawnParams);
        });
      },
      spawnLaser: (params) => {
        const spawnFrame = params.frame ?? frame;
        const owner = params.owner === "Player1" ? this.player : this.target;
        const spawnParams = {
          ...params,
          frame: spawnFrame,
          pausedUntil:
            params.pausedUntil ?? spawnFrame + owner.projectilePauseUntil,
        };
        this.pendingSpawns.push(() => {
          this.projectileSystem.spawnLaser(this.projectiles, spawnParams);
        });
      },
      spawnSegment: (params) => {
        const spawnFrame = params.frame ?? frame;
        const owner = params.owner === "Player1" ? this.player : this.target;
        const spawnParams = {
          ...params,
          frame: spawnFrame,
          pausedUntil:
            params.pausedUntil ?? spawnFrame + owner.projectilePauseUntil,
        };
        this.pendingSpawns.push(() => {
          this.projectileSystem.spawnSegment(this.projectiles, spawnParams);
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
          frame: params.frame ?? frame,
        };
        this.pendingSpawns.push(() => {
          this.projectileSystem.spawnLaser(this.projectiles, spawnParams);
        });
      },
    };
  }

  mobSpawnerState(): NeutralMobSpawnerState | undefined {
    return this.mobSpawner?.snapshot();
  }

  private stepMobSpawner(): void {
    if (!this.mobSpawner) return;
    // During time stop, freeze spawner (no new mobs, no volley scheduling)
    if (this.player.timeStopUntil > 0 || this.target.timeStopUntil > 0) return;
    this.mobSpawner.step({
      frame: this.frame,
      player: this.player,
      target: this.target,
      neutralMobs: this.neutralMobs,
      allocateMobId: () => this.allocateNeutralMobId(),
      spawnMob: (mob) => this.addNeutralMob(mob),
    });
  }

  private stepNeutralMobs(): void {
    this.sortNeutralMobs();
    const timeStopped =
      this.player.timeStopUntil > 0 || this.target.timeStopUntil > 0;
    if (timeStopped) {
      // During time stop: update previous positions for interpolation, freeze everything else
      for (const mob of this.neutralMobs) {
        mob.state.previousX = mob.state.x;
        mob.state.previousY = mob.state.y;
      }
      return;
    }
    for (const mob of this.neutralMobs) {
      const wasActive = mob.state.active;
      mob.step(this.neutralMobActionContext());
      if (wasActive && !mob.state.active) {
        mob.onDeath(null);
        mob.onDeathEffect();
      }
    }
    this.removeInactiveNeutralMobs();
  }

  private sortNeutralMobs(): void {
    this.neutralMobs.sort((left, right) => left.id - right.id);
  }

  private sortPoints(): void {
    this.points.sort((left, right) => left.id - right.id);
  }

  private removeInactiveNeutralMobs(): void {
    this.neutralMobs.splice(
      0,
      this.neutralMobs.length,
      ...this.neutralMobs.filter((mob) => mob.state.active),
    );
  }

  private stepPoints(): void {
    this.sortPoints();
    const timeStopped =
      this.player.timeStopUntil > 0 || this.target.timeStopUntil > 0;
    for (const point of this.points) {
      point.previousX = point.x;
      point.previousY = point.y;
      if (point.collectingBy) {
        point.collectTicksRemaining -= 1;
        if (point.collectTicksRemaining <= 0) {
          this.awardPoint(point);
          point.active = false;
        }
        continue;
      }
      if (timeStopped) {
        continue;
      }
      point.x = fp.toFloat(
        fp.add(fp.fromFloat(point.x), fp.fromFloat(point.vx)),
      );
      point.y = fp.toFloat(
        fp.add(fp.fromFloat(point.y), fp.fromFloat(point.vy)),
      );
      if (pointIsOutsideArena(point)) {
        point.active = false;
        continue;
      }
      this.tryCollectPoint(point);
    }
    this.points.splice(
      0,
      this.points.length,
      ...this.points.filter((point) => point.active),
    );
  }

  private tryCollectPoint(point: PointState): void {
    for (const fighter of [this.playerFighter, this.targetFighter]) {
      const state = fighter.state;
      if (state.deadUntil > 0) {
        continue;
      }
      const fpDistance = fpHypotFp(
        fp.sub(fp.fromFloat(point.x), fp.fromFloat(state.x)),
        fp.sub(fp.fromFloat(point.y), fp.fromFloat(state.y)),
      );
      if (fp.lte(fpDistance, fp.fromFloat(fighter.getPointCollectRadius()))) {
        point.collectingBy = state.key;
        point.collectTicksRemaining = POINT_COLLECT_TICKS;
        return;
      }
    }
  }

  private awardPoint(point: PointState): void {
    const fighter =
      point.collectingBy === "Player1"
        ? this.player
        : point.collectingBy === "Player2"
          ? this.target
          : undefined;
    if (fighter) {
      fighter.pointCount = Math.min(
        POINT_COUNT_MAX,
        fighter.pointCount + point.value,
      );
    }
  }

  private dropPointFromMob(mob: NeutralMobState): void {
    const rewardSize = mob.pointRewardSize;
    if (!rewardSize) {
      return;
    }
    const velocity = pointVelocityFromFrame(this.frame, "low");
    this.addPoint(
      createPointState({
        id: this.allocatePointId(),
        x: mob.x,
        y: mob.y,
        rewardSize,
        vx: velocity.vx,
        vy: velocity.vy,
      }),
    );
  }

  private restoreNeutralMobSnapshots(
    snapshots: readonly NeutralMobState[],
  ): void {
    const ids = new Set(snapshots.map((snapshot) => snapshot.id));
    this.neutralMobs.splice(
      0,
      this.neutralMobs.length,
      ...this.neutralMobs.filter((mob) => ids.has(mob.id)),
    );
    for (const snapshot of snapshots) {
      const existing = this.neutralMobs.find(
        (candidate) => candidate.id === snapshot.id,
      );
      if (existing) {
        existing.restore(snapshot);
      } else if (this.mobSpawner) {
        const created = this.mobSpawner.createMobFromSnapshot(snapshot);
        if (created) {
          this.neutralMobs.push(created);
        }
      }
    }
    this.sortNeutralMobs();
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
    const ring = createClearRingState({
      id: this.nextClearRingId++,
      owner: params.owner,
      x: params.x,
      y: params.y,
      radius: params.radius,
      frame: this.frame,
      duration: params.duration,
      followsOwner: params.followsOwner,
    });
    this.clearRings.push(ring);
    this.stepClearRings(this.projectiles);
  }

  private stepClearRings(
    projectiles: ProjectileState[] = this.projectiles,
  ): void {
    stepClearRings({
      frame: this.frame,
      clearRings: this.clearRings,
      projectiles,
      fighters: {
        Player1: this.player,
        Player2: this.target,
        Neutral: undefined,
      },
    });
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
            master.owner !== projectile.owner &&
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
        hitRadius: PLAYER_CORE_RADIUS,
      },
      {
        key: this.target.key,
        x: this.target.x,
        y: this.target.y,
        hitRadius: PLAYER_CORE_RADIUS,
      },
      ...this.neutralMobs
        .filter((mob) => mob.state.active)
        .sort((left, right) => left.id - right.id)
        .map((mob) => ({
          key: mob.state.key,
          x: mob.state.x,
          y: mob.state.y,
          hitRadius: mob.state.hitRadius,
          hitWidth: mob.state.hitWidth,
          hitHeight: mob.state.hitHeight,
          mobId: mob.id,
        })),
    ];
  }
}

function neutralMobIdFromHitTarget(
  target: ProjectileHitTarget,
): number | undefined {
  return target.mobId;
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

function clampPointCount(pointCount: number): number {
  if (!Number.isFinite(pointCount)) {
    return 0;
  }
  return Math.max(0, Math.min(POINT_COUNT_MAX, Math.floor(pointCount)));
}
