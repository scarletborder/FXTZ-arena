import Phaser from "phaser";
import { createRaidLogicRuntime } from "@repo/raid-logic";
import type { ServerMessage } from "@repo/types";

import { queueBattleAssets } from "../battle/assets";
import { P2pConnection, type P2pStatus } from "../network/p2p";
import { connectionManager, type LoadingData, type SceneKey } from "./shared";
import { uiSettings } from "../store/settings";
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
  private connectionBadge: Phaser.GameObjects.Container | undefined;
  private connectionStatusText: Phaser.GameObjects.Text | undefined;
  private onlineReady = false;
  private p2pReady = false;
  private p2p: P2pConnection | undefined;
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
    this.p2pReady = false;
    this.p2p = undefined;
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
      if (!this.scene.isActive()) return;
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
      this.createConnectionBadge();
      this.setConnectionStatus("p2p 初始化中", 0xffcf6e);
    }

    if (data.mode === "online") {
      this.p2p = data.p2p ?? new P2pConnection(connectionManager, {
        localPlayerId: data.localPlayerId ?? "Player1",
        enabled: uiSettings.p2pEnabled,
        stunServer: uiSettings.stunServer,
        onStatus: (status) => this.handleP2pStatus(status),
        onMessage: () => undefined,
      });
      this.p2pReady = this.p2p.status !== "connecting" && this.p2p.status !== "idle";
      connectionManager.setMessageHandler((msg: ServerMessage) => {
        if (!this.scene.isActive()) {
          return;
        }
        if (this.p2p?.handleServerMessage(msg)) {
          return;
        }
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
      this.p2p.start();
    }

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      if (this.loadingData.mode === "online") {
        connectionManager.setMessageHandler(null);
        this.p2p?.close();
        this.p2p = undefined;
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
    if (this.loadingData.mode === "online" && (!this.onlineReady || !this.p2pReady)) return;
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
    const p2p = this.p2p;
    this.p2p = undefined;
    p2p?.setStatusHandler(undefined);
    p2p?.setMessageHandler(() => undefined);
    this.scene.start("battle", {
      ...this.loadingData,
      p2p,
    });
  }

  private handleP2pStatus(status: P2pStatus): void {
    if (!this.scene.isActive()) {
      return;
    }
    if (status === "connecting") {
      this.p2pReady = false;
      this.setConnectionStatus("p2p 尝试中", 0xffcf6e);
      this.label?.setText("正在尝试 P2P 连接…");
      return;
    }

    this.p2pReady = true;

    if (status === "connected") {
      this.setConnectionStatus("p2p 已连接", 0x34d399);
      this.label?.setText("P2P 已连接，等待玩家同步");
    } else if (status === "failed") {
      this.setConnectionStatus("p2p 不可用", 0xff5c66);
      this.label?.setText("P2P 不可用，已回落到专用服务器");
    } else if (status === "disabled") {
      this.setConnectionStatus("p2p 已关闭", 0x9fb4c8);
      this.label?.setText("P2P 已关闭，使用专用服务器");
    }

    this.tryGoToBattle();
  }

  private createConnectionBadge(): void {
    if (this.connectionBadge) return;

    const badge = this.add.container(20, 20).setDepth(40);
    const background = this.add.graphics();
    drawAngledPanel(background, 0, 0, 264, 52, 0x101820, 0x5c7185, 0.96);
    const text = this.add.text(18, 13, "p2p 初始化中", {
      fontFamily: "Arial, 'Microsoft YaHei', sans-serif",
      fontSize: "18px",
      fontStyle: "700",
      color: "#ffcf6e",
    });

    badge.add(background);
    badge.add(text);
    this.connectionBadge = badge;
    this.connectionStatusText = text;
  }

  private setConnectionStatus(text: string, color: number): void {
    if (!this.scene.isActive()) {
      return;
    }
    if (!this.connectionBadge) {
      this.createConnectionBadge();
    }
    this.connectionStatusText?.setText(text);
    this.connectionStatusText?.setColor(`#${color.toString(16).padStart(6, "0")}`);
    this.connectionBadge?.setVisible(true);
  }
}
