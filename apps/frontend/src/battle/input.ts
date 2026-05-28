import Phaser from "phaser";

import type { BattleInputState } from "@repo/raid-logic";
import { ARENA_HEIGHT_PX, ARENA_WIDTH_PX } from "@repo/constants";
import type { BattleKeyMap } from "./keybind";
import type { BattleMobileControls } from "./mobile-controls";

export type { BattleKeyMap } from "./keybind";

export interface BattleInputBundle extends BattleInputState {
  readonly pointerX: number;
  readonly pointerY: number;
}

export function createBattleInput(
  scene: Phaser.Scene,
  keys: BattleKeyMap,
  mobileControls?: BattleMobileControls,
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
  return {
    moveX,
    moveY,
    aimX: pointerWorld.x,
    aimY: pointerWorld.y,
    shootPressed:
      mobileState?.shootPressed ??
      (pointer.leftButtonDown() && !pointer.rightButtonDown()),
    bombPressed: mobileState?.bombPressed ?? pointer.rightButtonDown(),
    activeCardPressed:
      (mobileState?.activeCardPressed ?? false) ||
      Phaser.Input.Keyboard.JustDown(keys.e),
    reloadPressed: (mobileState?.reloadPressed ?? false) || keys.r.isDown,
    alternateHeld: (mobileState?.alternateHeld ?? false) || keys.shift.isDown,
    infoHeld: keys.tab.isDown,
    pointerX: pointerWorld.x,
    pointerY: pointerWorld.y,
  };
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
