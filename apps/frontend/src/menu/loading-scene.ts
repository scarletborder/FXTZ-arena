import Phaser from "phaser";
import type { ServerMessage } from "@repo/types";

import { drawAngledPanel, drawFightingBackdrop, headingStyle, bodyStyle } from "./ui";
import { connectionManager, type LoadingData, type SceneKey } from "./shared";

export class LoadingScene extends Phaser.Scene {
  private progress = 0;
  private loadingData!: LoadingData;
  private bar!: Phaser.GameObjects.Graphics;
  private label!: Phaser.GameObjects.Text;
  private onlineReady = false;
  private transitioning = false;
  private loadingDoneSent = false;

  constructor() {
    super("loading" satisfies SceneKey);
  }

  create(data: LoadingData): void {
    this.loadingData = data;
    this.progress = 0;
    this.onlineReady = false;
    this.transitioning = false;
    this.loadingDoneSent = false;

    drawFightingBackdrop(this, "LOADING", "READY");
    this.add.text(434, 278, "加载战局资源", headingStyle(34));
    this.label = this.add.text(444, 342, "本地资源检查中", bodyStyle("#d7e3ef", 20));
    this.bar = this.add.graphics();

    // In online mode, listen for the "room_state → fighting" signal
    if (data.mode === "online") {
      connectionManager.setMessageHandler((msg: ServerMessage) => {
        if (msg.type === "room_state" && msg.status === "fighting") {
          this.onlineReady = true;
        } else if (msg.type === "room_state" && msg.status === "finished") {
          this.label.setText("对手已退出，战斗结束");
          this.time.delayedCall(900, () => this.scene.start("home"));
        } else if (msg.type === "peer_status" && msg.status === "disconnected") {
          this.label.setText("对手断线，等待重连…");
        } else if (msg.type === "peer_status" && msg.status === "reconnected") {
          this.label.setText("对手已重连，等待加载完成…");
        }
      });
    }

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      if (this.loadingData.mode === "online") {
        connectionManager.setMessageHandler(null);
      }
    });
  }

  update(_: number, delta: number): void {
    this.progress = Math.min(1, this.progress + delta / 1250);
    this.bar.clear();
    drawAngledPanel(this.bar, 436, 394, 410, 34, 0x101820, 0x5c7185, 1);
    this.bar.fillStyle(0xe33d44, 1).fillRect(450, 405, 382 * this.progress, 12);

    if (this.progress > 0.64) {
      if (this.loadingData.mode === "online") {
        this.label.setText("加载完成，等待对手…");
      } else {
        this.label.setText(this.loadingData.mode === "ai" ? "等待对手加载中" : "靶场初始化中");
      }
    }

    if (this.progress >= 1 && !this.transitioning) {
      if (this.loadingData.mode === "online") {
        // Send loading_done, then wait for fighting state
        if (!this.loadingDoneSent) {
          connectionManager.send({ type: "loading_done" });
          this.loadingDoneSent = true;
        }

        // If we already got the fighting signal, go immediately
        if (this.onlineReady) {
          this.goToBattle();
        } else {
          this.label.setText("等待对手加载完成…");
        }
      } else {
        this.goToBattle();
      }
    }
  }

  private goToBattle(): void {
    if (this.transitioning) return;
    this.transitioning = true;
    this.scene.start("battle", this.loadingData);
  }
}
