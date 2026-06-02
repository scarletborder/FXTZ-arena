import Phaser from "phaser";

import type { BattleInputState } from "@repo/raid-logic";
import { ARENA_HEIGHT_PX, ARENA_WIDTH_PX } from "@repo/constants";
import type { FighterState } from "./types";
import type { BattleKeyMap } from "./keybind";
import type { BattleMobileControls } from "./mobile-controls";

export type { BattleKeyMap } from "./keybind";

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
): BattleInputBundle {
  const mobileState = mobileControls?.readState();
  const pointerWorld = getBattlePointerWorld(scene, mobileControls);
  const pointer = scene.input.activePointer;
  const keyboardMoveX = ((keys.d.isDown ? 1 : 0) - (keys.a.isDown ? 1 : 0)) as
    | -1
    | 0
    | 1;
  const keyboardMoveY = ((keys.s.isDown ? 1 : 0) - (keys.w.isDown ? 1 : 0)) as
    | -1
    | 0
    | 1;
  const moveX = mobileState?.moveX || keyboardMoveX;
  const moveY = mobileState?.moveY || keyboardMoveY;
  const manualReloadPressed = (mobileState?.reloadPressed ?? false) || keys.r.isDown;
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
      Phaser.Input.Keyboard.JustDown(keys.e),
    reloadPressed:
      manualReloadPressed ||
      emptyShotReloadPressed ||
      shouldAutoReloadAfterLastShot(autoReloadContext),
    alternateHeld: (mobileState?.alternateHeld ?? false) || keys.shift.isDown,
    infoHeld: keys.tab.isDown,
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
    x: Phaser.Math.Clamp(x, 0, ARENA_WIDTH_PX),
    y: Phaser.Math.Clamp(y, 0, ARENA_HEIGHT_PX),
  };
}
