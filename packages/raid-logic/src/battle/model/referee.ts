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
  addCollaborateScore(key: "Player1" | "Player2", value: number): void;
}): void {
  const { owner, victim, projectile } = params.ctx;
  if (victim.key !== "Player1" && victim.key !== "Player2") {
    return;
  }
  if (!params.rules.canProjectileGrazeTarget(owner, victim.key)) {
    return;
  }
  const fighter = victim.key === "Player1" ? params.player : params.target;
  if (
    fighter.deadUntil > 0 ||
    fighter.grazedProjectileIds.includes(projectile.id)
  ) {
    return;
  }
  fighter.grazedProjectileIds = [...fighter.grazedProjectileIds, projectile.id];
  fighter.pointCount = clampPointCount(
    fighter.pointCount +
      (owner === "Neutral"
        ? NEUTRAL_PROJECTILE_GRAZE_POINT_REWARD
        : ENEMY_PROJECTILE_GRAZE_POINT_REWARD),
  );
  params.addCollaborateScore(victim.key, COLLABORATE_GRAZE_SCORE);
}
