import Phaser from "phaser";
import { BattleEvents } from "@repo/constants";
import { CollaborateTransitionDialog } from "../ui/CollaborateTransitionDialog";
import { BattleKeyMap } from "../../input-controller/input";
import type { BattleTransitionPresentationModel } from "../model";

const TRANSITION_READY_HOLD_MS = 900;

export class CollaborateTransitionController {
  private dialog: CollaborateTransitionDialog | undefined;
  private readyHoldMs = 0;
  private readyHoldTriggered = false;

  constructor(
    private scene: Phaser.Scene,
    private getKeys: () => BattleKeyMap,
  ) {
    this.dialog = new CollaborateTransitionDialog(scene, () => {
      this.scene.events.emit(BattleEvents.TRANSITION_READY);
    });
  }

  update(model: BattleTransitionPresentationModel, delta: number): void {
    this.dialog?.update(model);
    this.updateKeyboard(model, delta);
  }

  destroy(): void {
    this.dialog?.destroy();
    this.dialog = undefined;
  }

  private updateKeyboard(model: BattleTransitionPresentationModel, delta: number): void {
    if (!model.visible) {
      this.resetHold();
      return;
    }

    if (model.localReady) {
      this.resetHold();
      return;
    }

    const keys = this.getKeys();
    if (keys.reload.isDown) {
      this.readyHoldMs = Math.min(TRANSITION_READY_HOLD_MS, this.readyHoldMs + delta);
      if (this.readyHoldMs >= TRANSITION_READY_HOLD_MS && !this.readyHoldTriggered) {
        this.readyHoldTriggered = true;
        this.scene.events.emit(BattleEvents.TRANSITION_READY);
      }
    } else {
      this.resetHold();
    }
    this.dialog?.setReadyHoldProgress(this.readyHoldMs / TRANSITION_READY_HOLD_MS);
  }

  private resetHold(): void {
    this.readyHoldMs = 0;
    this.readyHoldTriggered = false;
    this.dialog?.setReadyHoldProgress(0);
  }
}
