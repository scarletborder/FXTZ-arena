import {
  COLLABORATE_GRAZE_SCORE,
  ENEMY_PROJECTILE_GRAZE_POINT_REWARD,
  type MobState,
  NEUTRAL_PROJECTILE_GRAZE_POINT_REWARD,
  type ProjectileCollisionContext,
} from "@repo/types";
import type {
  CharacterActionContext,
  FighterKey,
  FighterState,
  ProjectileState,
  TrainingStats,
} from "@repo/content";

import type { BattleFighter } from "./battle-fighter";
import type { BattleRules } from "./battle-rules";
import type { NeutralMobManager } from "./manager/neutral-mob-manager";
import { clampPointCount } from "./manager/point-manager";
import type { ProjectileHitTarget } from "./projectile";
import { mulberry32 } from "./utils/random";

export function resolveProjectileHit(params: {
  readonly ctx: ProjectileCollisionContext<
    ProjectileState,
    ProjectileHitTarget,
    FighterKey
  >;
  readonly rules: BattleRules;
  readonly player: FighterState;
  readonly target: FighterState;
  readonly playerFighter: BattleFighter;
  readonly targetFighter: BattleFighter;
  readonly neutralMobManager: NeutralMobManager;
  readonly stats: TrainingStats;
  readonly frame: number;
  createActionContext(fighter: FighterState): CharacterActionContext;
  handleNeutralMobKilled(mob: MobState, source: FighterKey): void;
  cancelTimeStop(fighter: FighterState): void;
  handleFighterDefeated(fighter: FighterState): void;
}): boolean {
  const { owner, victim } = params.ctx;
  if (!params.rules.canProjectileDamageTarget(owner, victim.key)) {
    return false;
  }
  if (victim.mobId !== undefined) {
    return params.neutralMobManager.handleProjectileHit({
      target: victim,
      owner,
      projectile: params.ctx.projectile,
      damage: params.ctx.projectile.damage,
      onKilled: (mob, source) => params.handleNeutralMobKilled(mob, source),
    });
  }

  const fighterState = victim.key === "Player1" ? params.player : params.target;
  const victimFighter =
    victim.key === "Player1" ? params.playerFighter : params.targetFighter;
  const attackerCards =
    owner === "Player1"
      ? params.playerFighter.cardDefinitions()
      : owner === "Player2"
        ? params.targetFighter.cardDefinitions()
        : [];
  const result = victimFighter.onProjectileHit({
    owner,
    victim: fighterState,
    player: params.player,
    target: params.target,
    stats: params.stats,
    frame: params.frame,
    damage: params.ctx.damage,
    actionContext: params.createActionContext(fighterState),
    attackerCards,
  });
  if (result === "ignored") {
    return false;
  }
  if (fighterState.timeStopUntil > 0) {
    params.cancelTimeStop(fighterState);
  }
  if (result === "game-over") {
    params.handleFighterDefeated(fighterState);
    return true;
  }
  return true;
}

export function resolveProjectileGraze(params: {
  readonly ctx: ProjectileCollisionContext<
    ProjectileState,
    ProjectileHitTarget,
    FighterKey
  >;
  readonly rules: BattleRules;
  readonly player: FighterState;
  readonly target: FighterState;
  readonly playerFighter: BattleFighter;
  readonly targetFighter: BattleFighter;
  readonly seed: number;
  addCollaborateScore(key: "Player1" | "Player2", value: number): void;
}): boolean {
  const { owner, victim, projectile } = params.ctx;
  if (victim.key !== "Player1" && victim.key !== "Player2") {
    return false;
  }
  if (!params.rules.canProjectileGrazeTarget(owner, victim.key)) {
    return false;
  }
  const fighter = victim.key === "Player1" ? params.player : params.target;
  const victimFighter =
    victim.key === "Player1" ? params.playerFighter : params.targetFighter;
  if (
    fighter.deadUntil > 0 ||
    fighter.grazedProjectileIds.includes(projectile.id)
  ) {
    return false;
  }
  fighter.grazedProjectileIds = [...fighter.grazedProjectileIds, projectile.id];
  fighter.pointCount = clampPointCount(
    fighter.pointCount +
    (owner === "Neutral"
      ? NEUTRAL_PROJECTILE_GRAZE_POINT_REWARD
      : ENEMY_PROJECTILE_GRAZE_POINT_REWARD),
  );
  params.addCollaborateScore(victim.key, COLLABORATE_GRAZE_SCORE);
  return victimFighter.battleCardInstances().some((card) =>
    card.onGraze({
      projectile,
      owner,
      victim: fighter,
      damage: 0,
      random: makeGrazeRandom(params.seed, projectile.id, owner, victim.key),
    }),
  );
}

function makeGrazeRandom(
  seed: number,
  projectileId: number,
  owner: FighterKey,
  victimKey: FighterKey,
): () => number {
  const mixedSeed = mixGrazeSeed(seed, projectileId, owner, victimKey);
  return mulberry32(mixedSeed);
}

function mixGrazeSeed(
  seed: number,
  projectileId: number,
  owner: FighterKey,
  victimKey: FighterKey,
): number {
  let value = seed >>> 0;
  value = Math.imul(value ^ projectileId, 0x9e3779b1) >>> 0;
  value = Math.imul(value ^ fighterKeyToInt(owner), 0x85ebca6b) >>> 0;
  value = Math.imul(value ^ fighterKeyToInt(victimKey), 0xc2b2ae35) >>> 0;
  return value >>> 0;
}

function fighterKeyToInt(key: FighterKey): number {
  switch (key) {
    case "Player1":
      return 1;
    case "Player2":
      return 2;
    default:
      return 3;
  }
}
