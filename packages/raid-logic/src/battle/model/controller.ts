import { fp } from "@shaisrc/fixed-point";

import { PLAYER_CORE_RADIUS } from "@repo/types";
import type {
  BattleInputState,
  ArenaBounds,
  NeutralMobState,
} from "@repo/types";
import type {
  CharacterActionContext,
  FighterKey,
  FighterState,
  PointState,
  ProjectileState,
} from "@repo/content";
import { fpAtan2, fpClamp } from "@repo/content";

import type { CpuPlayer } from "../aicpu";
import type { BattleFighter } from "./battle-fighter";
import type { NeutralMobManager } from "./manager/neutral-mob-manager";

export type ActiveCardSwitchHandler = (
  fighter: BattleFighter,
  activeCardSwitchId: string | undefined,
) => void;

export interface FighterControllerBindings {
  readonly frame: number;
  readonly gameOver: boolean;
  readonly player: FighterState;
  readonly target: FighterState;
  readonly targetFighter: BattleFighter;
  readonly projectiles: readonly ProjectileState[];
  readonly points: readonly PointState[];
  readonly arenaBounds: ArenaBounds;
  readonly cpuPlayer: CpuPlayer | undefined;
  readonly neutralMobManager: NeutralMobManager;
  readonly currentAimByFighter: Record<
    FighterKey,
    { readonly x: number; readonly y: number }
  >;
  createActionContext(self: FighterState): CharacterActionContext;
  processActiveCardSwitch: ActiveCardSwitchHandler;
  registerActiveCardUse(fighter: FighterState): void;
  pauseActiveCardCooldowns(ticks: number): void;
  consumeAim(): void;
  setLastTargetInput(input: BattleInputState): void;
}

export function processFighterActions(
  bindings: FighterControllerBindings,
  fighter: BattleFighter,
  input: BattleInputState | undefined,
): void {
  if (bindings.gameOver) return;
  const state = fighter.state;
  if (state.deadUntil > 0) return;

  if (!input) {
    if (state.key === "Player2") {
      if (bindings.cpuPlayer) {
        stepTargetAi(bindings);
      } else {
        stepTargetSimple(bindings);
      }
    }
    return;
  }

  bindings.processActiveCardSwitch(fighter, input.activeCardSwitchId);
  applyInputMovement(bindings, fighter, input);
  fighter.handleReload(input.reloadPressed);

  const ctx = bindings.createActionContext(state);
  if (input.activeCardPressed && fighter.useActiveCard(ctx)) {
    bindings.registerActiveCardUse(state);
    bindings.consumeAim();
  }
  if (input.bombPressed) {
    const previousTimeStopUntil = state.timeStopUntil;
    fighter.useBomb(ctx, input.aimX, input.aimY);
    bindings.consumeAim();
    pauseCooldownsForNewTimeStop(bindings, state, previousTimeStopUntil);
  }
  if (input.shootPressed) {
    fighter.fire(ctx, input.aimX, input.aimY);
    bindings.consumeAim();
  }
}

function stepTargetAi(bindings: FighterControllerBindings): void {
  const fighter = bindings.target;
  const aiInput = bindings.cpuPlayer!.getAction({
    frame: bindings.frame,
    self: fighter,
    opponent: bindings.player,
    projectiles: bindings.projectiles,
    neutralMobs: bindings.neutralMobManager
      .states()
      .filter((mob): mob is NeutralMobState => mob.key === "Neutral"),
    points: bindings.points,
  });

  bindings.setLastTargetInput(aiInput);
  bindings.targetFighter.selectActiveCharacter(aiInput.alternateHeld);
  bindings.currentAimByFighter[fighter.key] = {
    x: aiInput.aimX,
    y: aiInput.aimY,
  };
  fighter.facing = fpAtan2(
    fp.fromFloat(aiInput.aimY - fighter.y),
    fp.fromFloat(aiInput.aimX - fighter.x),
  );
  bindings.targetFighter.moveBy(aiInput);
  if (
    bindings.targetFighter.postUpdate(bindings.createActionContext(fighter))
  ) {
    bindings.consumeAim();
  }
  bindings.targetFighter.handleReload(aiInput.reloadPressed);

  const ctx = bindings.createActionContext(fighter);
  if (aiInput.bombPressed) {
    const previousTimeStopUntil = fighter.timeStopUntil;
    bindings.targetFighter.useBomb(ctx, aiInput.aimX, aiInput.aimY);
    pauseCooldownsForNewTimeStop(bindings, fighter, previousTimeStopUntil);
  }
  if (aiInput.shootPressed) {
    bindings.targetFighter.fire(ctx, aiInput.aimX, aiInput.aimY);
  }
}

function stepTargetSimple(bindings: FighterControllerBindings): void {
  const fighter = bindings.target;
  if (fighter.movementLockedUntil === 0) {
    const fpFrame = fp.fromInt(bindings.frame);
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
        fp.fromFloat(bindings.arenaBounds.width * 0.65),
        fp.fromFloat(bindings.arenaBounds.width - PLAYER_CORE_RADIUS),
      ),
    );
    fighter.y = fp.toFloat(
      fpClamp(
        fp.add(fp.fromFloat(fighter.y), fpCosOffset),
        fp.fromFloat(PLAYER_CORE_RADIUS),
        fp.fromFloat(bindings.arenaBounds.height - PLAYER_CORE_RADIUS),
      ),
    );
  }
  fighter.facing = fpAtan2(
    fp.fromFloat(bindings.player.y - fighter.y),
    fp.fromFloat(bindings.player.x - fighter.x),
  );
  bindings.currentAimByFighter[fighter.key] = {
    x: bindings.player.x,
    y: bindings.player.y,
  };
  if (
    bindings.targetFighter.postUpdate(bindings.createActionContext(fighter))
  ) {
    bindings.consumeAim();
  }
  const ctx = bindings.createActionContext(fighter);
  const shootPressed = bindings.frame % 72 === 0;
  if (shootPressed) {
    bindings.targetFighter.fire(ctx, bindings.player.x, bindings.player.y);
  }
  bindings.setLastTargetInput({
    moveX:
      Math.sin(bindings.frame / 36) > 0.01
        ? 1
        : Math.sin(bindings.frame / 36) < -0.01
          ? -1
          : 0,
    moveY:
      Math.cos(bindings.frame / 50) > 0.01
        ? 1
        : Math.cos(bindings.frame / 50) < -0.01
          ? -1
          : 0,
    aimX: Math.trunc(bindings.player.x),
    aimY: Math.trunc(bindings.player.y),
    shootPressed,
    bombPressed: false,
    activeCardPressed: false,
    reloadPressed: false,
    alternateHeld: false,
    infoHeld: false,
  });
}

function applyInputMovement(
  bindings: FighterControllerBindings,
  fighter: BattleFighter,
  input: BattleInputState,
): void {
  const state = fighter.state;
  fighter.selectActiveCharacter(input.alternateHeld);
  bindings.currentAimByFighter[state.key] = { x: input.aimX, y: input.aimY };
  state.facing = fpAtan2(
    fp.fromFloat(input.aimY - state.y),
    fp.fromFloat(input.aimX - state.x),
  );
  fighter.moveBy(input);
  if (fighter.postUpdate(bindings.createActionContext(state))) {
    bindings.consumeAim();
  }
}

function pauseCooldownsForNewTimeStop(
  bindings: FighterControllerBindings,
  state: FighterState,
  previousTimeStopUntil: number,
): void {
  if (
    state.activeCharacter.bombId === "sakuya_time_stop" &&
    state.timeStopUntil > previousTimeStopUntil
  ) {
    bindings.pauseActiveCardCooldowns(
      state.timeStopUntil - previousTimeStopUntil,
    );
  }
}
