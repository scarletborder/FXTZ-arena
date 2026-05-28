import Phaser from "phaser";
import { createRaidLogicRuntime } from "@repo/raid-logic";
import type { ServerMessage } from "@repo/types";

import { queueBattleAssets } from "../battle/assets";
import { connectionManager, type LoadingData, type SceneKey } from "./shared";
import {
  bodyStyle,
  drawAngledPanel,
  drawFightingBackdrop,
  headingStyle,
} from "./ui";

export class LoadingScene extends Phaser.Scene {
  private progress = 0;
  private loadingData!: LoadingData;
  private bar: Phaser.GameObjects.Graphics | undefined;
  private label: Phaser.GameObjects.Text | undefined;
  private onlineReady = false;
  private transitioning = false;
  private loadingDoneSent = false;
  private runtimeReady = false;

  constructor() {
    super("loading" satisfies SceneKey);
  }

  init(data: LoadingData): void {
    this.loadingData = data;
    this.progress = 0;
    this.onlineReady = false;
    this.transitioning = false;
    this.loadingDoneSent = false;
    this.runtimeReady = false;
  }

  preload(): void {
    drawFightingBackdrop(this, "LOADING", "READY");
    this.add.text(434, 278, "加载战斗资源", headingStyle(34));
    this.label = this.add.text(
      444,
      342,
      "本地资源检查中",
      bodyStyle("#d7e3ef", 20),
    );
    this.bar = this.add.graphics();
    this.renderProgress();

    this.load.on("progress", (value: number) => {
      this.progress = value;
      this.renderProgress();
    });

    this.load.once("complete", () => {
      this.progress = 1;
      this.renderProgress();
      this.label?.setText(
        this.loadingData.mode === "online"
          ? "资源加载完成，等待玩家同步"
          : "资源加载完成",
      );
    });

    const queued = queueBattleAssets(this);
    if (queued === 0) {
      this.progress = 1;
      this.renderProgress();
      this.label?.setText(
        this.loadingData.mode === "online"
          ? "资源加载完成，等待玩家同步"
          : "资源加载完成",
      );
    }
  }

  create(data: LoadingData): void {
    this.loadingData = data;
    this.label?.setText(
      data.mode === "online" ? "初始化战斗，同步前准备" : "初始化战斗",
    );

    if (data.mode === "online") {
      connectionManager.setMessageHandler((msg: ServerMessage) => {
        if (msg.type === "room_state" && msg.status === "fighting") {
          this.onlineReady = true;
          this.tryGoToBattle();
        } else if (msg.type === "room_state" && msg.status === "finished") {
          this.label?.setText("对手已退出，战斗结束");
          this.time.delayedCall(900, () => this.scene.start("home"));
        } else if (msg.type === "peer_status" && msg.status === "disconnected") {
          this.label?.setText("对手断线，等待重连");
        } else if (msg.type === "peer_status" && msg.status === "reconnected") {
          this.label?.setText("对手已重连，等待玩家同步");
        }
      });
    }

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      if (this.loadingData.mode === "online") {
        connectionManager.setMessageHandler(null);
      }
    });

    this.prepareRuntime();
  }

  private async prepareRuntime(): Promise<void> {
    const runtime = createRaidLogicRuntime({
      mode: this.loadingData.mode ?? "training",
      loadouts: this.loadingData.loadouts,
      mapId: this.loadingData.mapId ?? this.loadingData.battleConfig?.mapId,
    });

    await runtime.initialize();
    if (!this.scene.isActive()) return;

    this.loadingData = {
      ...this.loadingData,
      runtime,
    };
    this.runtimeReady = true;

    if (this.loadingData.mode === "online") {
      if (connectionManager.roomStatus === "fighting") {
        this.onlineReady = true;
      } else {
        this.sendLoadingDone();
        this.label?.setText("等待玩家同步");
      }
    }

    this.tryGoToBattle();
  }

  private sendLoadingDone(): void {
    if (this.loadingDoneSent) return;
    connectionManager.send({ type: "loading_done" });
    this.loadingDoneSent = true;
  }

  private tryGoToBattle(): void {
    if (!this.runtimeReady) return;
    if (this.loadingData.mode === "online" && !this.onlineReady) return;
    this.goToBattle();
  }

  private renderProgress(): void {
    if (!this.bar) return;
    this.bar.clear();
    drawAngledPanel(this.bar, 436, 394, 410, 34, 0x101820, 0x5c7185, 1);
    this.bar
      .fillStyle(0xe33d44, 1)
      .fillRect(450, 405, 382 * this.progress, 12);
  }

  private goToBattle(): void {
    if (this.transitioning) return;
    this.transitioning = true;
    this.scene.start("battle", this.loadingData);
  }
}
