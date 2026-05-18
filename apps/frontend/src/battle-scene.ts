import Phaser from "phaser";

import { FIXED_STEP_MS } from "./battle/constants";
import { createBattleInput, type BattleKeyMap } from "./battle/input";
import { BattleModel } from "./battle/model";
import { BattleView } from "./battle/view";
import type { BattleInputState } from "./battle/types";

export class BattleScene extends Phaser.Scene {
  private accumulator = 0;
  private keys!: BattleKeyMap;
  private model!: BattleModel;
  private view!: BattleView;
  private lastInput!: BattleInputState & {
    readonly pointerX: number;
    readonly pointerY: number;
  };

  constructor() {
    super("battle");
  }

  create(): void {
    this.input.setDefaultCursor("none");
    this.input.mouse?.disableContextMenu();
    this.keys = this.input.keyboard!.addKeys({
      w: "W",
      a: "A",
      s: "S",
      d: "D",
      shift: Phaser.Input.Keyboard.KeyCodes.SHIFT,
      r: "R",
      tab: Phaser.Input.Keyboard.KeyCodes.TAB,
      enter: Phaser.Input.Keyboard.KeyCodes.ENTER,
      e: "E",
    }) as BattleKeyMap;
    this.model = new BattleModel();
    this.view = new BattleView(this);
    this.lastInput = createBattleInput(this, this.keys);
  }

  update(_: number, delta: number): void {
    this.accumulator += delta;
    while (this.accumulator >= FIXED_STEP_MS) {
      this.lastInput = createBattleInput(this, this.keys) satisfies BattleInputState & {
        readonly pointerX: number;
        readonly pointerY: number;
      };
      if (this.model.gameOver && Phaser.Input.Keyboard.JustDown(this.keys.enter)) {
        this.model.reset();
      } else {
        this.model.step(this.lastInput);
      }
      this.accumulator -= FIXED_STEP_MS;
    }
    this.lastInput = {
      ...this.lastInput,
      aimX: this.input.activePointer.x,
      aimY: this.input.activePointer.y,
      pointerX: this.input.activePointer.x,
      pointerY: this.input.activePointer.y,
    };
    this.view.render(this.model, this.lastInput, this.accumulator / FIXED_STEP_MS);
  }
}
