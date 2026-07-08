import { secondsToTicks } from "@repo/types";

import type { FighterKey, FighterState, TrainingStats } from "@repo/content";

const STATUS_VISIBLE_TICKS = secondsToTicks(1.5);

export function applyHit(params: {
  readonly owner: FighterKey;
  readonly victim: FighterState;
  readonly player: FighterState;
  readonly target: FighterState;
  readonly stats: TrainingStats;
  readonly frame: number;
  readonly damage: number;
  readonly defaultBombs: number;
  readonly lifeLoss: number;
  readonly respawnBombDelta: number;
}): "ignored" | "accepted" | "game-over" {
  if (params.victim.invulnerableUntil > 0 || params.victim.deadUntil > 0) {
    return "ignored";
  }

  params.victim.damageTaken += params.damage;
  params.victim.hitsTaken += 1;
  params.victim.flashUntil = params.frame + secondsToTicks(3);
  params.victim.statusVisibleUntil = params.frame + STATUS_VISIBLE_TICKS;
  params.stats.hits += 1;
  params.stats.damage += params.damage;

  if (params.owner === "Player1") {
    params.player.hits += 1;
  } else {
    params.target.hits += 1;
  }

  const lifeLoss = Math.max(0, Math.trunc(params.lifeLoss));
  params.victim.lives = Math.max(0, params.victim.lives - lifeLoss);

  if (lifeLoss <= 0) {
    return "accepted";
  }

  if (params.victim.lives <= 0) {
    params.victim.deaths += 1;
    return "game-over";
  }

  params.victim.bombs = Math.max(
    0,
    Math.trunc(params.defaultBombs + params.respawnBombDelta),
  );
  params.victim.invulnerableUntil = secondsToTicks(3);
  return "accepted";
}

export function getFireCooldown(rank: FighterState["activeCharacter"]["fireRate"]): number {
  if (rank === "low") {
    return 16;
  }
  if (rank === "high") {
    return 6;
  }
  return 10;
}
