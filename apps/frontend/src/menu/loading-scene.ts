import Phaser from "phaser";
import { createRaidLogicRuntime } from "@repo/raid-logic";
import { t } from "@repo/i18n";
import type { ServerMessage } from "@repo/types";

import { queueBattleAssets } from "../battle/assets";
import { P2pConnection, type PeerConnection, type P2pStatus } from "../network/p2p";
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
  private peerLoadingReady = false;
  private p2p: PeerConnection | undefined;
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
    this.peerLoadingReady = false;
    this.p2p = undefined;
    this.transitioning = false;
    this.loadingDoneSent = false;
    this.runtimeReady = false;
  }

  preload(): void {
    drawFightingBackdrop(this, "LOADING", "READY");
    this.add.text(434, 278, t("loading.title"), headingStyle(34));
    this.label = this.add.text(
      444,
      342,
      t("loading.local_checking"),
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
          ? t("loading.resources_ready_waiting")
          : t("loading.resources_ready"),
      );
    });

    const queued = queueBattleAssets(this);
    if (queued === 0) {
      this.progress = 1;
      this.renderProgress();
      this.label?.setText(
        this.loadingData.mode === "online"
          ? t("loading.resources_ready_waiting")
          : t("loading.resources_ready"),
      );
    }
  }

  create(data: LoadingData): void {
    this.loadingData = data;
    this.label?.setText(
      data.mode === "online" ? t("loading.init_sync") : t("loading.init_local"),
    );

    if (data.mode === "online" || data.mode === "local") {
      this.createConnectionBadge();
      this.setConnectionStatus(t("loading.p2p_init"), 0xffcf6e);
    }

    if (data.mode === "online" || data.mode === "local") {
      this.p2p = data.p2p ?? new P2pConnection(connectionManager, {
        localPlayerId: data.localPlayerId ?? "Player1",
        enabled: data.mode === "local" ? true : data.battleConfig?.p2pEnabled === true,
        stunServer: uiSettings.stunServer,
        onStatus: (status) => this.handleP2pStatus(status),
        onMessage: (message) => this.handleP2pMessage(message),
      });
      this.p2p.setStatusHandler((status) => this.handleP2pStatus(status));
      this.p2p.setMessageHandler((message) => this.handleP2pMessage(message));
      this.p2pReady = this.p2p.status !== "connecting" && this.p2p.status !== "idle";
      if (this.loadingData.mode === "local") {
        this.peerLoadingReady = this.p2p.remoteLoadingDone;
      }
      this.handleP2pStatus(this.p2p.status);
      if (data.mode === "online") {
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
            this.label?.setText(t("loading.peer_left_end"));
            this.time.delayedCall(900, () => this.scene.start("home"));
          } else if (msg.type === "peer_status" && msg.status === "disconnected") {
            this.label?.setText(t("loading.peer_disconnect_wait"));
          } else if (msg.type === "peer_status" && msg.status === "reconnected") {
            this.label?.setText(t("loading.peer_reconnected"));
          }
        });
      }
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
    const runtimeMode = this.loadingData.mode === "ai"
      ? "ai"
      : this.loadingData.mode === "online" || this.loadingData.mode === "local"
        ? "online"
        : "training";
    const runtime = createRaidLogicRuntime({
      mode: runtimeMode,
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
        this.label?.setText(t("loading.waiting_sync"));
      }
    } else if (this.loadingData.mode === "local") {
      this.onlineReady = true;
      this.maybeSendLoadingDone();
      this.label?.setText(t("loading.local_p2p_connected_wait"));
    }

    this.tryGoToBattle();
  }

  private sendLoadingDone(): void {
    if (this.loadingDoneSent) return;
    if (this.loadingData.mode === "local") {
      if (this.p2p?.send({ type: "loading_done" })) {
        this.loadingDoneSent = true;
      }
      return;
    }
    connectionManager.send({ type: "loading_done" });
    this.loadingDoneSent = true;
  }

  private maybeSendLoadingDone(): void {
    if (!this.runtimeReady || this.loadingDoneSent) {
      return;
    }

    if (this.loadingData.mode === "local") {
      if (!this.p2pReady) {
        return;
      }
      this.sendLoadingDone();
      return;
    }

    this.sendLoadingDone();
  }

  private tryGoToBattle(): void {
    if (!this.runtimeReady) return;
    if (this.loadingData.mode === "local") {
      if (!this.onlineReady || !this.p2pReady || !this.loadingDoneSent || !this.peerLoadingReady) return;
    } else if (this.loadingData.mode === "online" && (!this.onlineReady || !this.p2pReady)) {
      return;
    }
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
      this.setConnectionStatus(t("loading.p2p_trying"), 0xffcf6e);
      this.label?.setText(this.loadingData.mode === "local" ? t("loading.p2p_attempt") : t("loading.p2p_attempt_online"));
      return;
    }

    this.p2pReady = this.loadingData.mode === "local" ? status === "connected" : true;

    if (status === "connected") {
      this.setConnectionStatus(t("loading.p2p_connected"), 0x34d399);
      this.label?.setText(this.loadingData.mode === "local" ? t("loading.local_p2p_connected_wait") : t("loading.p2p_connected_wait_online"));
      this.maybeSendLoadingDone();
    } else if (status === "failed") {
      this.setConnectionStatus(t("loading.p2p_unavailable"), 0xff5c66);
      this.label?.setText(this.loadingData.mode === "local" ? t("loading.p2p_fallback_local") : t("loading.p2p_fallback_online"));
    } else if (status === "disabled") {
      this.setConnectionStatus(t("loading.p2p_closed"), 0x9fb4c8);
      this.label?.setText(this.loadingData.mode === "local" ? t("loading.p2p_closed_local") : t("loading.p2p_closed_online"));
    }

    this.tryGoToBattle();
  }

  private handleP2pMessage(message: ServerMessage): void {
    if (!this.scene.isActive()) {
      return;
    }

    if (message.type === "peer_loading_done" && message.playerId !== (this.loadingData.localPlayerId ?? "Player1")) {
      this.peerLoadingReady = true;
      this.tryGoToBattle();
    }
  }

  private createConnectionBadge(): void {
    if (this.connectionBadge) return;

    const badge = this.add.container(20, 20).setDepth(40);
    const background = this.add.graphics();
    drawAngledPanel(background, 0, 0, 264, 52, 0x101820, 0x5c7185, 0.96);
    const text = this.add.text(18, 13, t("loading.p2p_init"), {
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
