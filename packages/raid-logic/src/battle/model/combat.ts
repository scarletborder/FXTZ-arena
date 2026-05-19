import { secondsToTicks } from "@repo/types";

import type { FighterKey, FighterState, TrainingStats } from "../types";
import { getDefaultBombs } from "./fighter";

const STATUS_VISIBLE_TICKS = secondsToTicks(1.5);

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

  const isFatal = params.victim.lives <= 0;

  params.victim.damageTaken += params.damage;
  params.victim.flashUntil = params.frame + secondsToTicks(3);
  params.victim.statusVisibleUntil = params.frame + STATUS_VISIBLE_TICKS;
  params.stats.hits += 1;
  params.stats.damage += params.damage;

  if (params.owner === "player") {
    params.player.hits += 1;
  } else {
    params.target.hits += 1;
  }

  if (isFatal) {
    params.victim.deaths += 1;
    return params.victim.key === "target" ? "accepted" : "game-over";
  }

  params.victim.lives -= 1;
  params.victim.bombs = getDefaultBombs(params.victim.activeCard);
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
