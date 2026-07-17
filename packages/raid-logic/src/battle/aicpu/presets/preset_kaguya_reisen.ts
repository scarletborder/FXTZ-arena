import type { FighterState } from "@repo/types";
import { secondsToTicks } from "@repo/types";

import type { DodgeIntent } from "../dodger";
import type {
  CpuPreset,
  CpuPresetContext,
  CpuPresetDecision,
  CpuPresetMovementContext,
} from "./types";
import {
  alternateHeldForDesired,
  approachPlayer,
  canBombAfterSwitch,
  canShoot,
  countThreatsNearFighter,
  distanceBetween,
  predictiveAim,
  shouldReload,
} from "./common";

const KAGUYA_PREFERRED_RANGE = 128;
const REISEN_PREFERRED_RANGE = 360;
const KAGUYA_CLOSE_RANGE = 190;
const KAGUYA_BOMB_CHECK_INTERVAL = secondsToTicks(10);
const KAGUYA_BOMB_PLAYER_RADIUS = 80;
const KAGUYA_BOMB_PROJECTILE_THRESHOLD = 15;

export class KaguyaReisenPreset implements CpuPreset {
  readonly id = "preset_kaguya_reisen";

  matches(self: FighterState): boolean {
    return (
      self.primaryCharacter.id === "kaguya" &&
      self.alternateCharacter.id === "reisen"
    );
  }

  getDesiredMove(ctx: CpuPresetMovementContext): DodgeIntent | undefined {
    const desired = desiredCharacter(ctx);
    return desired === "kaguya"
      ? approachPlayer(ctx.self, ctx.opponent, KAGUYA_PREFERRED_RANGE, 0.3)
      : approachPlayer(ctx.self, ctx.opponent, REISEN_PREFERRED_RANGE, 0.18);
  }

  getDecision(ctx: CpuPresetContext): CpuPresetDecision {
    const playerProjectilePressure = countThreatsNearFighter(
      ctx.opponent,
      ctx.projectiles,
      ctx.frame,
      KAGUYA_BOMB_PLAYER_RADIUS,
    );
    const wantsKaguyaBomb =
      ctx.frame % KAGUYA_BOMB_CHECK_INTERVAL === 0 &&
      playerProjectilePressure > KAGUYA_BOMB_PROJECTILE_THRESHOLD &&
      canBombAfterSwitch(ctx.self, "kaguya");
    const wantsReisenBomb =
      ctx.dodgeResult.emergencyBomb && canBombAfterSwitch(ctx.self, "reisen");
    const desired = wantsReisenBomb
      ? "reisen"
      : wantsKaguyaBomb
        ? "kaguya"
        : desiredCharacter(ctx);
    const aim = wantsKaguyaBomb
      ? { x: ctx.opponent.x, y: ctx.opponent.y }
      : predictiveAim(ctx);

    return {
      shootPressed: canShoot(ctx.self, ctx.intel),
      bombPressed: wantsReisenBomb || wantsKaguyaBomb,
      reloadPressed: shouldReload(ctx.self, ctx.dodgeResult.threatCount),
      alternateHeld: alternateHeldForDesired(ctx.self, desired),
      aimX: aim.x,
      aimY: aim.y,
      strategicMove: this.getDesiredMove(ctx),
    };
  }

  reset(): void {
    // Stateless.
  }
}

export const kaguyaReisenPreset = new KaguyaReisenPreset();

function desiredCharacter(
  ctx: CpuPresetMovementContext | CpuPresetContext,
): "kaguya" | "reisen" {
  return distanceBetween(ctx.self, ctx.opponent) <= KAGUYA_CLOSE_RANGE
    ? "kaguya"
    : "reisen";
}
