import type { FighterState } from "@repo/content";

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

const CLOSE_PRESSURE_RANGE = 270;
const SAKUYA_PREFERRED_RANGE = 315;
const CIRNO_PREFERRED_RANGE = 155;
const SELF_DANGER_RADIUS = 178;
const SELF_BOMB_THREAT_COUNT = 5;
const PLAYER_SENSE_RANGE = 520;

export class SakuyaCirnoPreset implements CpuPreset {
  readonly id = "preset_sakuya_cirno";

  matches(self: FighterState): boolean {
    return (
      self.primaryCharacter.id === "sakuya" &&
      self.alternateCharacter.id === "cirno"
    );
  }

  getDesiredMove(ctx: CpuPresetMovementContext): DodgeIntent | undefined {
    const desired = desiredCharacter(ctx);
    const preferredRange =
      desired === "cirno" ? CIRNO_PREFERRED_RANGE : SAKUYA_PREFERRED_RANGE;
    const bravery = desired === "cirno" ? 0.36 : 0.22;
    return approachPlayer(ctx.self, ctx.opponent, preferredRange, bravery);
  }

  getDecision(ctx: CpuPresetContext): CpuPresetDecision {
    const desired = ctx.dodgeResult.emergencyBomb ? "cirno" : desiredCharacter(ctx);
    const aim = predictiveAim(ctx);
    const useCirnoBomb =
      desired === "cirno" &&
      ctx.dodgeResult.emergencyBomb &&
      canBombAfterSwitch(ctx.self, "cirno");

    return {
      shootPressed: canShoot(ctx.self, ctx.intel),
      bombPressed: useCirnoBomb,
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

export const sakuyaCirnoPreset = new SakuyaCirnoPreset();

function desiredCharacter(
  ctx: CpuPresetMovementContext | CpuPresetContext,
): "sakuya" | "cirno" {
  const selfThreats = countThreatsNearFighter(
    ctx.self,
    ctx.projectiles,
    ctx.frame,
    SELF_DANGER_RADIUS,
  );
  if (selfThreats >= SELF_BOMB_THREAT_COUNT) {
    return "cirno";
  }

  const playerDistance = distanceBetween(ctx.self, ctx.opponent);
  if (playerDistance <= CLOSE_PRESSURE_RANGE) {
    return "cirno";
  }
  if (playerDistance <= PLAYER_SENSE_RANGE) {
    return "sakuya";
  }

  return ctx.self.activeCharacter.id === "cirno" ? "cirno" : "sakuya";
}
