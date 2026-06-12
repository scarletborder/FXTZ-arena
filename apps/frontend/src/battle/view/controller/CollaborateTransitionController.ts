import Phaser from "phaser";
import { BattleEvents } from "@repo/constants";
import { CollaborateTransitionDialog } from "../ui/CollaborateTransitionDialog";

export class CollaborateTransitionController {
  private dialog: CollaborateTransitionDialog | undefined;

  constructor(private scene: Phaser.Scene) {
    this.dialog = new CollaborateTransitionDialog(scene, () => {
      this.scene.events.emit(BattleEvents.TRANSITION_READY);
    });
  }

  update(collaborateExtra: any, localFighterKey: "Player1" | "Player2"): void {
    this.dialog?.update(collaborateExtra, localFighterKey);
  }

  destroy(): void {
    this.dialog?.destroy();
    this.dialog = undefined;
  }
}