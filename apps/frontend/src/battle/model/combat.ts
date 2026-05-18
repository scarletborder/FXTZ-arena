import { secondsToTicks } from "@repo/types";

import type { FighterKey, FighterState, TrainingStats } from "../types";

export function applyHit(params: {
  readonly owner: FighterKey;
  readonly victim: FighterState;
  readonly player: FighterState;
  readonly target: FighterState;
  readonly stats: TrainingStats;
  readonly frame: number;
  readonly damage: number;
}): "ignored" | "accepted" | "game-over" {
  if (params.victim.invulnerableUntil > 0 || params.victim.deadUntil > 0) {
    return "ignored";
  }

  params.victim.lives -= 1;
  params.victim.damageTaken += params.damage;
  params.victim.flashUntil = params.frame + secondsToTicks(3);
  params.victim.statusVisibleUntil = params.frame + 90;
  params.stats.hits += 1;
  params.stats.damage += params.damage;

  if (params.owner === "player") {
    params.player.hits += 1;
  } else {
    params.target.hits += 1;
  }

  if (params.victim.lives <= 0) {
    params.victim.deaths += 1;
    return params.victim.key === "target" ? "accepted" : "game-over";
  }

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
