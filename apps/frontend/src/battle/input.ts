import Phaser from "phaser";

import type { BattleInputState } from "@repo/raid-logic";
import { GAME_HEIGHT, GAME_WIDTH } from "@repo/constants";

export interface BattleInputBundle extends BattleInputState {
  readonly pointerX: number;
  readonly pointerY: number;
}

export function createBattleInput(scene: Phaser.Scene, keys: BattleKeyMap): BattleInputBundle {
  const pointer = scene.input.activePointer;
  const pointerWorld = getBattlePointerWorld(scene);
  const moveX = ((keys.d.isDown ? 1 : 0) - (keys.a.isDown ? 1 : 0)) as -1 | 0 | 1;
  const moveY = ((keys.s.isDown ? 1 : 0) - (keys.w.isDown ? 1 : 0)) as -1 | 0 | 1;
  return {
    moveX,
    moveY,
    aimX: pointerWorld.x,
    aimY: pointerWorld.y,
    shootPressed: pointer.leftButtonDown() && !pointer.rightButtonDown(),
    bombPressed: pointer.rightButtonDown(),
    activeCardPressed: Phaser.Input.Keyboard.JustDown(keys.e),
    reloadPressed: keys.r.isDown,
    alternateHeld: keys.shift.isDown,
    infoHeld: keys.tab.isDown,
    pointerX: pointerWorld.x,
    pointerY: pointerWorld.y,
  };
}

export function getBattlePointerWorld(scene: Phaser.Scene): { readonly x: number; readonly y: number } {
  const pointer = scene.input.activePointer;
  const cameraPoint = pointer.positionToCamera(scene.cameras.main) as Phaser.Math.Vector2;
  const x = Number.isFinite(cameraPoint.x) ? cameraPoint.x : pointer.x;
  const y = Number.isFinite(cameraPoint.y) ? cameraPoint.y : pointer.y;
  return {
    x: Phaser.Math.Clamp(x, 0, GAME_WIDTH),
    y: Phaser.Math.Clamp(y, 0, GAME_HEIGHT),
  };
}

export interface BattleKeyMap {
  readonly w: Phaser.Input.Keyboard.Key;
  readonly a: Phaser.Input.Keyboard.Key;
  readonly s: Phaser.Input.Keyboard.Key;
  readonly d: Phaser.Input.Keyboard.Key;
  readonly shift: Phaser.Input.Keyboard.Key;
  readonly r: Phaser.Input.Keyboard.Key;
  readonly tab: Phaser.Input.Keyboard.Key;
  readonly enter: Phaser.Input.Keyboard.Key;
  readonly e: Phaser.Input.Keyboard.Key;
}
