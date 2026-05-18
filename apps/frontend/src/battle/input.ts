import Phaser from "phaser";

import type { BattleInputState } from "./types";

export interface BattleInputBundle extends BattleInputState {
  readonly pointerX: number;
  readonly pointerY: number;
}

export function createBattleInput(scene: Phaser.Scene, keys: BattleKeyMap): BattleInputBundle {
  const pointer = scene.input.activePointer;
  const moveX = ((keys.d.isDown ? 1 : 0) - (keys.a.isDown ? 1 : 0)) as -1 | 0 | 1;
  const moveY = ((keys.s.isDown ? 1 : 0) - (keys.w.isDown ? 1 : 0)) as -1 | 0 | 1;
  return {
    moveX,
    moveY,
    aimX: pointer.x,
    aimY: pointer.y,
    shootPressed: pointer.leftButtonDown() && !pointer.rightButtonDown(),
    bombPressed: pointer.rightButtonDown(),
    activeCardPressed: Phaser.Input.Keyboard.JustDown(keys.e),
    reloadPressed: keys.r.isDown,
    alternateHeld: keys.shift.isDown,
    infoHeld: keys.tab.isDown,
    pointerX: pointer.x,
    pointerY: pointer.y,
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
