import Phaser from "phaser";

import type { BattleInputState } from "@repo/raid-logic";
import {
  ARENA_HEIGHT_PX,
  ARENA_WIDTH_PX,
  type ArenaBounds,
} from "@repo/constants";
import type { FighterState } from "../types";
import type { BattleKeyMap } from ".";
import type { BattleMobileControls } from ".";

export type { BattleKeyMap } from ".";

export interface BattleInputBundle extends BattleInputState {
  readonly pointerX: number;
  readonly pointerY: number;
}

export interface BattleInputAutoReloadContext {
  readonly fighter: FighterState | undefined;
  readonly previousShotsFired: number;
}

export function createBattleInput(
  scene: Phaser.Scene,
  keys: BattleKeyMap,
  mobileControls?: BattleMobileControls,
  autoReloadContext?: BattleInputAutoReloadContext,
  arenaBounds?: ArenaBounds,
): BattleInputBundle {
  const mobileState = mobileControls?.readState();
  const pointerWorld = getBattlePointerWorld(
    scene,
    mobileControls,
    arenaBounds,
  );
  const pointer = scene.input.activePointer;
  const keyboardMoveX = ((keys.moveRight.isDown ? 1 : 0) - (keys.moveLeft.isDown ? 1 : 0)) as
    | -1
    | 0
    | 1;
  const keyboardMoveY = ((keys.moveDown.isDown ? 1 : 0) - (keys.moveUp.isDown ? 1 : 0)) as
    | -1
    | 0
    | 1;
  const moveX = mobileState?.moveX || keyboardMoveX;
  const moveY = mobileState?.moveY || keyboardMoveY;
  const manualReloadPressed =
    (mobileState?.reloadPressed ?? false) || keys.reload.isDown;
  const shootPressed =
    mobileState?.shootPressed ??
    (pointer.leftButtonDown() && !pointer.rightButtonDown());
  const emptyShotReloadPressed = shouldReloadInsteadOfShooting(
    autoReloadContext,
    shootPressed,
  );
  return {
    moveX,
    moveY,
    aimX: Math.trunc(pointerWorld.x),
    aimY: Math.trunc(pointerWorld.y),
    shootPressed: shootPressed && !emptyShotReloadPressed,
    bombPressed: mobileState?.bombPressed ?? pointer.rightButtonDown(),
    activeCardPressed:
      (mobileState?.activeCardPressed ?? false) ||
      Phaser.Input.Keyboard.JustDown(keys.activeCard),
    reloadPressed:
      manualReloadPressed ||
      emptyShotReloadPressed ||
      shouldAutoReloadAfterLastShot(autoReloadContext),
    alternateHeld: (mobileState?.alternateHeld ?? false) || keys.alternate.isDown,
    infoHeld: keys.info.isDown,
    transitionReadyPressed: false,
    pointerX: pointerWorld.x,
    pointerY: pointerWorld.y,
  };
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
