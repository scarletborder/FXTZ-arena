import Phaser from "phaser";
import { createDefaultRaidBattleConfig } from "@repo/raid-logic";
import type { MapId, PlayerLoadout } from "@repo/types";

import type { ConnectionManager } from "../network/client";
import { P2pConnection } from "../network/p2p";
import { uiSettings } from "../store/settings";
import {
  createBackButton,
  drawAngledPanel,
  drawFightingBackdrop,
  drawPanel,
} from "./ui";
import { type LocalPeerState, LocalLanSession } from "../network/local-lan";
import { installMenuAudioUnlock, type SceneKey } from "./shared";

export class LocalLanScene extends Phaser.Scene {
  private session: LocalLanSession | null = null;
  private peers: readonly LocalPeerState[] = [];
  private listLayer: Phaser.GameObjects.Container | null = null;
  private statusLabel!: Phaser.GameObjects.Text;
  private loadingToast: Phaser.GameObjects.Text | null = null;
  private starting = false;
  private matchedPeerId: string | null = null;
  private localPlayerId: "Player1" | "Player2" = "Player1";
  private currentP2p: P2pConnection | null = null;
  private localLoadout: PlayerLoadout | null = null;
  private remoteLoadout: PlayerLoadout | null = null;
  private selectedMapId: MapId = "arena_standard";

  constructor() {
    super("local-lan" satisfies SceneKey);
  }

  create(): void {
    installMenuAudioUnlock(this);
    this.starting = false;
    drawFightingBackdrop(this, "LOCAL", "LAN MATCHMAKING");
    createBackButton(this);
    this.add.text(90, 74, "本地局域网游玩", {
      fontFamily: "Arial, 'Microsoft YaHei', sans-serif",
      fontSize: "42px",
      fontStyle: "900",
      color: "#f6f1e6",
    });

    drawPanel(this, 72, 176, 1136, 456, "局域网游戏大厅");
    this.statusLabel = this.add.text(96, 220, "正在连接公共信令服务器…", {
      fontFamily: "Arial, 'Microsoft YaHei', sans-serif",
      fontSize: "16px",
      color: "#b7c7d8",
    });
    this.add.text(96, 248, "点击其他玩家发送申请；双方互相申请后自动进入房间。", {
      fontFamily: "Arial, 'Microsoft YaHei', sans-serif",
      fontSize: "14px",
      color: "#9fb4c8",
    });

    this.listLayer = this.add.container(0, 0);

    this.session = new LocalLanSession({
      onPeersChange: (peers) => {
        this.peers = peers;
        this.renderPeers();
      },
      onMatch: (peer) => {
        this.launchSelection(peer);
      },
      onBattleReady: (peer, loadout) => {
        if (this.matchedPeerId !== peer.id) {
          return;
        }
        this.remoteLoadout = loadout;
        this.tryLaunchLoading();
      },
      onStatusChange: (status) => {
        if (!this.scene.isActive()) {
          return;
        }
        this.statusLabel.setText(
          status === "connecting"
            ? "正在连接公共信令服务器…"
            : status === "connected"
              ? "已连接公共信令服务器"
              : status === "error"
                ? "公共信令连接失败，检查Internet连接"
                : "公共信令已断开",
        ).setColor(status === "connected" ? "#34d399" : status === "connecting" ? "#f7b733" : "#ff5c66");
      },
    });

    void this.session.connect(uiSettings.username).catch(() => {
      this.statusLabel.setText("公共信令连接失败，检查Internet连接").setColor("#ff5c66");
    });

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.session?.close();
      this.session = null;
      this.listLayer?.destroy();
      this.listLayer = null;
      this.loadingToast?.destroy();
      this.loadingToast = null;
    });
  }

  private renderPeers(): void {
    this.listLayer?.destroy();
    this.listLayer = this.add.container(0, 0);

    const peers = this.peers;
    if (peers.length === 0) {
      this.listLayer.add(this.add.text(104, 330, "暂无在线玩家，等待其他玩家进入同一局域网大厅…\n注意关闭网络代理", {
        fontFamily: "Arial, 'Microsoft YaHei', sans-serif",
        fontSize: "18px",
        color: "#9fb4c8",
      }));
      return;
    }

    peers.forEach((state, index) => {
      const x = index % 2 === 0 ? 96 : 652;
      const y = 300 + Math.floor(index / 2) * 92;
      this.listLayer?.add(this.createPeerCard(x, y, 532, 78, state));
    });
  }

  private createPeerCard(x: number, y: number, width: number, height: number, state: LocalPeerState): Phaser.GameObjects.Container {
    const container = this.add.container(x, y);
    const background = this.add.graphics();
    drawAngledPanel(background, 0, 0, width, height, state.matched ? 0x18212d : 0x111821, state.matched ? 0xffcf6e : state.incomingRequest ? 0x34d399 : state.outgoingRequest ? 0x9fd8ff : 0x5c7185, 0.97);
    const title = this.add.text(20, 14, state.peer.alias, {
      fontFamily: "Arial, 'Microsoft YaHei', sans-serif",
      fontSize: "20px",
      fontStyle: "700",
      color: state.matched ? "#ffcf6e" : "#f6f1e6",
    });
    const subtitle = this.add.text(20, 44, this.describePeerState(state), {
      fontFamily: "Arial, 'Microsoft YaHei', sans-serif",
      fontSize: "14px",
      color: state.matched ? "#ffcf6e" : state.incomingRequest ? "#34d399" : state.outgoingRequest ? "#9fd8ff" : "#b7c7d8",
    });
    const hitArea = this.add.rectangle(0, 0, width, height, 0xffffff, 0.001)
      .setOrigin(0, 0)
      .setInteractive({ useHandCursor: true });

    hitArea.on("pointerup", () => this.onPeerClicked(state));

    container.add([background, title, subtitle, hitArea]);
    return container;
  }

  private describePeerState(state: LocalPeerState): string {
    if (state.matched) {
      return "已配对，正在进入配装…";
    }
    if (state.incomingRequest && state.outgoingRequest) {
      return "双方已互相申请";
    }
    if (state.incomingRequest) {
      return "对方已向你申请";
    }
    if (state.outgoingRequest) {
      return "已向对方发起申请";
    }
    return "点击发送共同游玩申请";
  }

  private onPeerClicked(state: LocalPeerState): void {
    if (!this.session || this.starting) {
      return;
    }

    if (state.matched) {
      this.showToast("已经配对完成，正在进入配装…");
      return;
    }

    this.session.requestPeer(state.peer.id);
    this.showToast(`已向 ${state.peer.alias} 发送申请`);
    this.renderPeers();
  }

  private launchSelection(peer: LocalPeerState["peer"]): void {
    if (!this.session || this.starting) {
      return;
    }
    this.starting = true;
    this.matchedPeerId = peer.id;
    this.localLoadout = null;
    this.remoteLoadout = null;

    const localClient = this.session.currentClient;
    this.localPlayerId = localClient && localClient.id < peer.id ? "Player1" : "Player2";
    const p2pTransport = this.session.createP2pBridge(peer.id, this.localPlayerId);
    const p2p = new P2pConnection(p2pTransport as unknown as ConnectionManager, {
      localPlayerId: this.localPlayerId,
      enabled: true,
      stunServer: uiSettings.stunServer,
      onStatus: () => undefined,
      onMessage: () => undefined,
    });
    this.currentP2p = p2p;
    this.session.setPeerPacketHandler((message) => p2p.handleServerMessage(message));
    p2p.start();

    const battleConfig = createDefaultRaidBattleConfig();
    this.selectedMapId = battleConfig.mapId;
    this.loadingToast?.destroy();
    this.loadingToast = this.add.text(640, 650, `正在准备配装：${peer.alias}`, {
      fontFamily: "Arial, 'Microsoft YaHei', sans-serif",
      fontSize: "16px",
      color: "#ffcf6e",
      backgroundColor: "#111821ee",
      padding: { x: 16, y: 8 },
    }).setOrigin(0.5);

    // Use a scene switch here so the LAN lobby sleeps instead of staying
    // active behind the selection screen.
    this.scene.switch("select", {
      mode: "local",
      playerName: uiSettings.username,
      opponentName: peer.alias,
      returnScene: "local-lan",
      debug: uiSettings.debug,
      onLocalConfirm: (loadout: PlayerLoadout) => {
        this.localLoadout = loadout;
        this.session?.sendBattleReady(peer.id, loadout);
        this.tryLaunchLoading();
      },
    });
  }

  private tryLaunchLoading(): void {
    if (!this.session || !this.currentP2p || !this.localLoadout || !this.remoteLoadout || !this.matchedPeerId) {
      return;
    }

    const peer = this.peers.find((state) => state.peer.id === this.matchedPeerId)?.peer;
    if (!peer) {
      return;
    }

    const loadouts = this.localPlayerId === "Player1"
      ? { player: this.localLoadout, target: this.remoteLoadout }
      : { player: this.remoteLoadout, target: this.localLoadout };

    this.scene.stop("select");
    this.loadingToast?.setText(`正在加载战斗：${peer.alias}`);
    this.scene.launch("loading", {
      mode: "local",
      playerName: uiSettings.username,
      opponentName: peer.alias,
      returnScene: "local-lan",
      loadouts,
      mapId: this.selectedMapId,
      debug: uiSettings.debug,
      localPlayerId: this.localPlayerId,
      p2p: this.currentP2p,
    });
  }

  private showToast(message: string): void {
    const toast = this.add.text(640, 672, message, {
      fontFamily: "Arial, 'Microsoft YaHei', sans-serif",
      fontSize: "16px",
      color: "#ffcf6e",
      backgroundColor: "#111821ee",
      padding: { x: 16, y: 8 },
    }).setOrigin(0.5).setAlpha(0);
    this.tweens.add({ targets: toast, alpha: 1, duration: 180, yoyo: true, hold: 1600, onComplete: () => toast.destroy() });
  }
}
