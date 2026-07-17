import Phaser from "phaser";

import type { BattleInputState } from "@repo/types";
import {
  ARENA_HEIGHT_PX,
  ARENA_WIDTH_PX,
  type ArenaBounds,
} from "@repo/constants";
import type { FighterState } from "../types";
import type { BattleKeyMap } from ".";
import type { BattleMobileControls } from ".";
import type { BattleJoystickController } from "./gamepad";

export type { BattleKeyMap } from ".";

export interface BattleInputBundle extends BattleInputState {
  readonly pointerX: number;
  readonly pointerY: number;
}

export interface BattleAimInput {
  readonly aimX: number;
  readonly aimY: number;
  readonly pointerX: number;
  readonly pointerY: number;
}

export interface BattleInputAutoReloadContext {
  readonly fighter: FighterState | undefined;
  readonly previousShotsFired: number;
}

export interface BattleInputOptions {
  readonly mobileControls?: BattleMobileControls;
  readonly joystickControls?: BattleJoystickController;
  readonly keyboardEnabled?: boolean;
  readonly pointerEnabled?: boolean;
  readonly autoReloadContext?: BattleInputAutoReloadContext;
  readonly arenaBounds?: ArenaBounds;
}

export function createBattleInput(
  scene: Phaser.Scene,
  keys: BattleKeyMap,
  mobileControlsOrOptions?: BattleMobileControls | BattleInputOptions,
  autoReloadContext?: BattleInputAutoReloadContext,
  arenaBounds?: ArenaBounds,
): BattleInputBundle {
  const options = isBattleInputOptions(mobileControlsOrOptions)
    ? mobileControlsOrOptions
    : {
        mobileControls: mobileControlsOrOptions,
        autoReloadContext,
        arenaBounds,
      };
  const mobileControls = options.mobileControls;
  const joystickControls = options.joystickControls;
  const keyboardEnabled = options.keyboardEnabled ?? true;
  const pointerEnabled = options.pointerEnabled ?? true;
  const mobileState = mobileControls?.readState();
  const pointerWorld = getBattlePointerWorld(
    scene,
    mobileControls,
    options.arenaBounds,
  );
  const joystickState = joystickControls?.readState(options.arenaBounds);
  const pointer = scene.input.activePointer;
  const keyboardMoveX = ((keys.moveRight.isDown ? 1 : 0) -
    (keys.moveLeft.isDown ? 1 : 0)) as -1 | 0 | 1;
  const keyboardMoveY = ((keys.moveDown.isDown ? 1 : 0) -
    (keys.moveUp.isDown ? 1 : 0)) as -1 | 0 | 1;
  const moveX =
    mobileState?.moveX ||
    joystickState?.moveX ||
    (keyboardEnabled ? keyboardMoveX : 0);
  const moveY =
    mobileState?.moveY ||
    joystickState?.moveY ||
    (keyboardEnabled ? keyboardMoveY : 0);
  const manualReloadPressed =
    (mobileState?.reloadPressed ?? false) ||
    (joystickState?.reloadPressed ?? false) ||
    (keyboardEnabled && keys.reload.isDown);
  const shootPressed =
    (mobileState?.shootPressed ??
      (joystickState?.shootPressed || undefined) ??
      false) ||
    (pointerEnabled && pointer.leftButtonDown() && !pointer.rightButtonDown());
  const emptyShotReloadPressed = shouldReloadInsteadOfShooting(
    options.autoReloadContext,
    shootPressed,
  );
  return {
    moveX,
    moveY,
    aimX: Math.trunc(joystickState?.aimX ?? pointerWorld.x),
    aimY: Math.trunc(joystickState?.aimY ?? pointerWorld.y),
    shootPressed: shootPressed && !emptyShotReloadPressed,
    bombPressed:
      (mobileState?.bombPressed ??
        (joystickState?.bombPressed || undefined) ??
        false) ||
      (pointerEnabled && pointer.rightButtonDown()),
    activeCardPressed:
      (mobileState?.activeCardPressed ?? false) ||
      (joystickState?.activeCardPressed ?? false) ||
      (keyboardEnabled && Phaser.Input.Keyboard.JustDown(keys.activeCard)),
    reloadPressed:
      manualReloadPressed ||
      emptyShotReloadPressed ||
      shouldAutoReloadAfterLastShot(options.autoReloadContext),
    alternateHeld:
      (mobileState?.alternateHeld ?? false) ||
      (joystickState?.alternateHeld ?? false) ||
      (keyboardEnabled && keys.alternate.isDown),
    infoHeld:
      (joystickState?.infoHeld ?? false) ||
      (keyboardEnabled && keys.info.isDown),
    transitionReadyPressed:
      (joystickState?.enterPressed ?? false) ||
      (keyboardEnabled && Phaser.Input.Keyboard.JustDown(keys.enter)),
    pointerX: joystickState?.aimX ?? pointerWorld.x,
    pointerY: joystickState?.aimY ?? pointerWorld.y,
  };
}

export function createBattleAimInput(
  scene: Phaser.Scene,
  mobileControls?: BattleMobileControls,
  arenaBounds?: ArenaBounds,
): BattleAimInput {
  const pointerWorld = getBattlePointerWorld(
    scene,
    mobileControls,
    arenaBounds,
  );
  return {
    aimX: Math.trunc(pointerWorld.x),
    aimY: Math.trunc(pointerWorld.y),
    pointerX: pointerWorld.x,
    pointerY: pointerWorld.y,
  };
}

function isBattleInputOptions(
  value: BattleMobileControls | BattleInputOptions | undefined,
): value is BattleInputOptions {
  return Boolean(
    value &&
      ("joystickControls" in value ||
        "autoReloadContext" in value ||
        "arenaBounds" in value),
  );
}

function shouldReloadInsteadOfShooting(
  context: BattleInputAutoReloadContext | undefined,
  shootPressed: boolean,
): boolean {
  const fighter = context?.fighter;
  if (!shootPressed || !fighter) {
    return false;
  }
  return (
    fighter.ammo <= 0 &&
    fighter.reloadRemaining <= 0 &&
    fighter.ammo < fighter.ammoCapacity
  );
}

function shouldAutoReloadAfterLastShot(
  context: BattleInputAutoReloadContext | undefined,
): boolean {
  const fighter = context?.fighter;
  if (!fighter) {
    return false;
  }
  return (
    fighter.shotsFired > context.previousShotsFired &&
    fighter.ammo <= 0 &&
    fighter.reloadRemaining <= 0 &&
    fighter.ammo < fighter.ammoCapacity
  );
}

export function getBattlePointerWorld(
  scene: Phaser.Scene,
  mobileControls?: BattleMobileControls,
  arenaBounds?: ArenaBounds,
): { readonly x: number; readonly y: number } {
  const mobileAim = mobileControls?.aimWorld();
  if (mobileAim) {
    return mobileAim;
  }
  const pointer = scene.input.activePointer;
  const cameraPoint = pointer.positionToCamera(
    scene.cameras.main,
  ) as Phaser.Math.Vector2;
  const x = Number.isFinite(cameraPoint.x) ? cameraPoint.x : pointer.x;
  const y = Number.isFinite(cameraPoint.y) ? cameraPoint.y : pointer.y;
  return {
    x: Phaser.Math.Clamp(x, 0, arenaBounds?.width ?? ARENA_WIDTH_PX),
    y: Phaser.Math.Clamp(y, 0, arenaBounds?.height ?? ARENA_HEIGHT_PX),
  };
}
