import type { FighterState } from "@repo/types";
import type { TickerManager } from "../ticker-manager";

const ACTIVE_CARD_COOLDOWN_GROUP_PREFIX = "active-card-cooldown";

export class ActiveCardCooldownManager {
  constructor(private readonly ticker: TickerManager) {}

  register(fighter: FighterState, frame: number): void {
    const group = activeCardCooldownGroup(fighter.key);
    this.ticker.removeGroup(group);
    if (fighter.activeCardCooldownUntil > 0) {
      this.ticker.register(frame + fighter.activeCardCooldownUntil, group);
    }
  }

  sync(fighters: readonly [FighterState, FighterState]): void {
    this.syncOne(fighters[0], fighters);
    this.syncOne(fighters[1], fighters);
  }

  restore(
    fighters: readonly [FighterState, FighterState],
    frame: number,
  ): void {
    this.restoreOne(fighters[0], fighters, frame);
    this.restoreOne(fighters[1], fighters, frame);
  }

  pause(fighters: readonly [FighterState, FighterState], ticks: number): void {
    if (ticks <= 0) return;
    this.ticker.pauseGroup(activeCardCooldownGroup("Player1"), ticks);
    this.ticker.pauseGroup(activeCardCooldownGroup("Player2"), ticks);
    this.sync(fighters);
  }

  resume(fighters: readonly [FighterState, FighterState], ticks: number): void {
    if (ticks <= 0) return;
    this.ticker.resumeGroup(activeCardCooldownGroup("Player1"), ticks);
    this.ticker.resumeGroup(activeCardCooldownGroup("Player2"), ticks);
    this.sync(fighters);
  }

  private syncOne(
    fighter: FighterState,
    fighters: readonly [FighterState, FighterState],
  ): void {
    const group = activeCardCooldownGroup(fighter.key);
    if (fighter.activeCardCooldownUntil <= 0) {
      fighter.activeCardCooldownUntil = 0;
      this.ticker.removeGroup(group);
      return;
    }

    const remaining = Math.max(
      0,
      this.ticker.getRemainingTicks(group) - timeStopRemaining(fighters),
    );
    fighter.activeCardCooldownUntil = remaining;
    if (remaining <= 0) {
      this.ticker.removeGroup(group);
    }
  }

  private restoreOne(
    fighter: FighterState,
    fighters: readonly [FighterState, FighterState],
    frame: number,
  ): void {
    const group = activeCardCooldownGroup(fighter.key);
    if (fighter.activeCardCooldownUntil <= 0) {
      fighter.activeCardCooldownUntil = 0;
      this.ticker.removeGroup(group);
      return;
    }

    const tickerRemaining = this.ticker.getRemainingTicks(group);
    if (tickerRemaining > 0) {
      fighter.activeCardCooldownUntil = Math.max(
        0,
        tickerRemaining - timeStopRemaining(fighters),
      );
      return;
    }

    this.ticker.register(
      frame + fighter.activeCardCooldownUntil + timeStopRemaining(fighters),
      group,
    );
  }
}

function activeCardCooldownGroup(key: FighterState["key"]): string {
  return `${ACTIVE_CARD_COOLDOWN_GROUP_PREFIX}:${key}`;
}

function timeStopRemaining(
  fighters: readonly [FighterState, FighterState],
): number {
  return Math.max(fighters[0].timeStopUntil, fighters[1].timeStopUntil);
}
