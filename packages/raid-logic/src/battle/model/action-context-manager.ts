import { fp } from "@shaisrc/fixed-point";

import type {
  CharacterActionContext,
  BulletCmd,
  LaserCmd,
  EffectState,
  FighterKey,
  FighterState,
  ProjectileState,
  TrainingStats,
} from "@repo/content";
import type {
  ArenaBounds,
  BattleRoomMode,
  NeutralMobActionContext,
} from "@repo/types";

import {
  createCharacterActionContext as buildCharacterActionContext,
  createNeutralMobActionContext as buildNeutralMobActionContext,
} from "./context-factory";
import type { BattleRules } from "./battle-rules";
import type { EffectSystem } from "./effects";
import type { ClearRingManager } from "./manager/clear-ring-manager";
import type {
  BulletProjectileParams,
  LaserProjectileParams,
  ProjectileHitTarget,
  ProjectileSystem,
} from "./projectile";
import type { TickerManager } from "./ticker-manager";
import type { BattleNeutralMob } from "./manager/neutral-mob-manager";

export interface BattleActionContextManagerContext {
  readonly arenaBounds: ArenaBounds;
  readonly projectiles: ProjectileState[];
  readonly effects: EffectState[];
  readonly stats: TrainingStats;
  readonly clearRingManager: ClearRingManager;
  readonly projectileSystem: ProjectileSystem;
  readonly effectSystem: EffectSystem;
  readonly ticker: TickerManager;
  readonly rules: BattleRules;
  readonly neutralMobs: readonly BattleNeutralMob[];
  getFrame(): number;
  getPlayer(): FighterState;
  getTarget(): FighterState;
  getBattleMode(): BattleRoomMode;
  getEnemyTargets(owner: FighterKey): readonly ProjectileHitTarget[];
  getAim(
    owner: FighterKey,
  ): { readonly x: number; readonly y: number } | undefined;
  allocateMobId(): number;
  spawnMob(mob: BattleNeutralMob): void;
  consumeAim(): void;
  deferSpawn(spawn: () => void): void;
  scheduleBullet(command: BulletCmd): void;
  scheduleLaser(command: LaserCmd): void;
}

export class BattleActionContextManager {
  constructor(private readonly context: BattleActionContextManagerContext) {}

  createCharacterActionContext(self: FighterState): CharacterActionContext {
    const frame = this.context.getFrame();
    return buildCharacterActionContext({
      frame,
      self,
      opponent:
        self.key === "Player1"
          ? this.context.getTarget()
          : this.context.getPlayer(),
      enemyTargets: this.context.getEnemyTargets(self.key),
      projectiles: this.context.projectiles,
      mobs: this.context.neutralMobs,
      effects: this.context.effects,
      stats: this.context.stats,
      aim: this.context.getAim(self.key),
      consumeAim: () => this.context.consumeAim(),
      allocateMobId: () => this.context.allocateMobId(),
      spawnMob: (mob) => {
        this.context.deferSpawn(() => this.context.spawnMob(mob));
      },
      spawnBullet: (params) => {
        const spawnFrame = params.frame ?? this.context.getFrame();
        const owner =
          params.owner === "Player1"
            ? this.context.getPlayer()
            : this.context.getTarget();
        const pauseTicks =
          params.pausedUntil === undefined ? owner.projectilePauseUntil : 0;
        const spawnParams = {
          ...params,
          sourceCharacterId:
            params.sourceCharacterId ?? self.activeCharacter.id,
          frame: spawnFrame,
          pausedUntil: params.pausedUntil ?? spawnFrame,
        };
        this.context.deferSpawn(() => {
          const startIndex = this.context.projectiles.length;
          this.context.projectileSystem.spawnBullet(
            this.context.projectiles,
            spawnParams,
          );
          const projectile = this.context.projectiles[startIndex];
          if (projectile) {
            this.context.ticker.pauseProjectileTimeline(projectile, pauseTicks);
          }
        });
      },
      spawnLaser: (params) => {
        const spawnFrame = params.frame ?? this.context.getFrame();
        const owner =
          params.owner === "Player1"
            ? this.context.getPlayer()
            : this.context.getTarget();
        const pauseTicks =
          params.pausedUntil === undefined ? owner.projectilePauseUntil : 0;
        const spawnParams = {
          ...params,
          sourceCharacterId:
            params.sourceCharacterId ?? self.activeCharacter.id,
          frame: spawnFrame,
          pausedUntil: params.pausedUntil ?? spawnFrame,
        };
        this.context.deferSpawn(() => {
          const startIndex = this.context.projectiles.length;
          this.context.projectileSystem.spawnLaser(
            this.context.projectiles,
            spawnParams,
          );
          const projectile = this.context.projectiles[startIndex];
          if (projectile) {
            this.context.ticker.pauseProjectileTimeline(projectile, pauseTicks);
          }
        });
      },
      scheduleBullet: (command) => this.context.scheduleBullet(command),
      scheduleLaser: (command) => this.context.scheduleLaser(command),
      spawnSegment: (params) => {
        const spawnFrame = params.frame ?? this.context.getFrame();
        const owner =
          params.owner === "Player1"
            ? this.context.getPlayer()
            : this.context.getTarget();
        const pauseTicks =
          params.pausedUntil === undefined ? owner.projectilePauseUntil : 0;
        const spawnParams = {
          ...params,
          sourceCharacterId:
            params.sourceCharacterId ?? self.activeCharacter.id,
          frame: spawnFrame,
          pausedUntil: params.pausedUntil ?? spawnFrame,
        };
        this.context.deferSpawn(() => {
          const startIndex = this.context.projectiles.length;
          this.context.projectileSystem.spawnSegment(
            this.context.projectiles,
            spawnParams,
          );
          const projectile = this.context.projectiles[startIndex];
          if (projectile) {
            this.context.ticker.pauseProjectileTimeline(projectile, pauseTicks);
          }
        });
      },
      clearProjectilesAround: (params) => {
        const before = this.context.projectiles.length;
        this.spawnClearRingEntity({
          owner: self.key,
          x: params.x,
          y: params.y,
          radius: params.radius,
          duration: 1,
        });
        return before - this.context.projectiles.length;
      },
      spawnClearRingEntity: (params) => {
        this.spawnClearRingEntity({
          owner: self.key,
          ...params,
        });
      },
      spawnClearRing: (params) => {
        this.context.effectSystem.spawnRing(
          this.context.effects,
          this.context.getFrame(),
          params.x,
          params.y,
          params.tint,
          fp.toFloat(fp.div(fp.fromFloat(params.radius), fp.fromInt(100))),
          params.duration,
        );
      },
      pauseProjectileTimeline: (projectile, ticks) => {
        this.context.ticker.pauseProjectileTimeline(projectile, ticks);
      },
    });
  }

  createNeutralMobActionContext(
    mob: BattleNeutralMob,
  ): NeutralMobActionContext<BulletProjectileParams, LaserProjectileParams> {
    return buildNeutralMobActionContext({
      frame: this.context.getFrame(),
      arenaBounds: this.context.arenaBounds,
      owner: mob.state.key,
      player: {
        x: this.context.getPlayer().x,
        y: this.context.getPlayer().y,
        reloadRemaining: this.context.getPlayer().reloadRemaining,
      },
      target: {
        x: this.context.getTarget().x,
        y: this.context.getTarget().y,
        reloadRemaining: this.context.getTarget().reloadRemaining,
      },
      enemyTargets: this.context.getEnemyTargets(mob.state.key),
      spawnBullet: (params) => {
        this.context.deferSpawn(() => {
          this.context.projectileSystem.spawnBullet(
            this.context.projectiles,
            params,
          );
        });
      },
      spawnLaser: (params) => {
        this.context.deferSpawn(() => {
          this.context.projectileSystem.spawnLaser(
            this.context.projectiles,
            params,
          );
        });
      },
    });
  }

  spawnClearRingEntity(params: {
    readonly owner: FighterKey;
    readonly x: number;
    readonly y: number;
    readonly radius: number;
    readonly duration: number;
    readonly followsOwner?: boolean;
  }): void {
    this.context.clearRingManager.spawn({
      owner: params.owner,
      x: params.x,
      y: params.y,
      radius: params.radius,
      frame: this.context.getFrame(),
      duration: params.duration,
      followsOwner: params.followsOwner,
    });
    this.stepClearRings(this.context.projectiles);
  }

  stepClearRings(
    projectiles: ProjectileState[] = this.context.projectiles,
  ): void {
    this.context.clearRingManager.step({
      frame: this.context.getFrame(),
      projectiles,
      fighters: {
        Player1: this.context.getPlayer(),
        Player2: this.context.getTarget(),
        Neutral: undefined,
      },
      rules: this.context.rules,
    });
  }
}
