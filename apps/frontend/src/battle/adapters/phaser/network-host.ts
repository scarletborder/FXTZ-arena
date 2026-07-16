import Phaser from "phaser";
import { BattleEvents } from "@repo/constants";
import type { PlayerId } from "@repo/types";

import { Depth } from "../../../utils/depth";
import type { BattleNetworkHost } from "../../session/network-session";

export class PhaserBattleNetworkHost implements BattleNetworkHost {
  private readonly statusText: Phaser.GameObjects.Text | undefined;

  constructor(
    private readonly scene: Phaser.Scene,
    enabled: boolean,
  ) {
    if (!enabled) return;

    this.statusText = scene.add
      .text(24, 24, "", {
        fontFamily: "Arial",
        fontSize: "18px",
        color: "#ffcf6e",
        backgroundColor: "#101820cc",
        padding: { x: 10, y: 6 },
      })
      .setScrollFactor(0)
      .setDepth(Depth.OnlineStatus)
      .setVisible(false);
  }

  showStatus(text: string): void {
    this.statusText?.setText(text).setVisible(true);
  }

  hideStatus(): void {
    this.statusText?.setVisible(false);
  }

  delay(ms: number, callback: () => void): void {
    this.scene.time.delayedCall(ms, callback);
  }

  finishBattle(winnerPlayerId: PlayerId, serverConfirmedFrame?: number): void {
    this.scene.events.emit(
      BattleEvents.GO_TO_ONLINE_RESULT,
      winnerPlayerId,
      serverConfirmedFrame,
    );
  }

  destroy(): void {
    this.statusText?.destroy();
  }
}
