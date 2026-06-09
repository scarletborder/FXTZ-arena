import Phaser from "phaser";
import { IS_DESKTOP_APP } from "@repo/constants";
import { t } from "@repo/i18n";
import type { MapId, PlayerLoadout, ServerMessage } from "@repo/types";

import type { PeerConnection } from "../network/p2p";
import { type UdpDirectSession, UdpDirectSession as UdpSession } from "../network/udp-direct-session";
import { uiSettings } from "../store/settings";
import { showMapDialog } from "./map-dialog";
import { installMenuAudioUnlock, type SceneKey, type TextFieldControl } from "./shared";
import { createBackButton, createCheckbox, createFightButton, createTextField, drawAngledPanel, drawFightingBackdrop, drawPanel } from "./ui";

export class UdpConnectScene extends Phaser.Scene {
  private activeField: TextFieldControl | null = null;
  private listenPort = "10800";
  private guestAddress = "";
  private mapDialogContainer: Phaser.GameObjects.Container | null = null;
  private waitDialog: Phaser.GameObjects.Container | null = null;
  private session: UdpDirectSession | null = null;
  private matchedPeerName: string | null = null;
  private localPlayerId: "Player1" | "Player2" = "Player1";
  private currentPeer: PeerConnection | null = null;
  private localLoadout: PlayerLoadout | null = null;
  private remoteLoadout: PlayerLoadout | null = null;
  private selectedMapId: MapId = "hakurei_shrine";
  private allowSpectators = true;
  private spectatorNames: readonly string[] = [];

  private readonly onKeyDown = (event: KeyboardEvent) => this.activeField?.handleKey(event);
  private readonly onPaste = (event: ClipboardEvent) => this.activeField?.handlePaste(event.clipboardData?.getData("text") ?? "");

  constructor() {
    super("udp-connect" satisfies SceneKey);
  }

  create(): void {
    installMenuAudioUnlock(this);
    drawFightingBackdrop(this, "UDP", "DIRECT LINK");
    createBackButton(this, "battle-start");
    this.add.text(90, 74, t("udp_connect.title"), {
      fontFamily: "Arial, 'Microsoft YaHei', sans-serif",
      fontSize: "42px",
      fontStyle: "900",
      color: "#f6f1e6",
    });

    drawPanel(this, 156, 150, 968, 208, t("udp_connect.as_host"));
    this.add.text(198, 220, t("udp_connect.port"), {
      fontFamily: "Arial, 'Microsoft YaHei', sans-serif",
      fontSize: "18px",
      color: "#f6f1e6",
    });
    const portField = createTextField(this, 198, 258, 220, {
      value: this.listenPort,
      maxLength: 5,
      onFocus: (field) => { this.activeField = field; },
      onChange: (value) => { this.listenPort = value.replace(/\D/g, "").slice(0, 5); },
    });
    this.add.existing(portField.container);
    this.add.existing(createCheckbox(this, 198, 328, this.allowSpectators, {
      label: t("udp_connect.allow_spectators"),
      onChange: (checked) => { this.allowSpectators = checked; },
    }).container);
    createFightButton(this, 840, 284, 220, 52, t("udp_connect.host_game"), () => this.showHostMapDialog(), { accent: 0x34d399 });

    const divider = this.add.graphics();
    divider.lineStyle(2, 0x34475c, 0.9);
    divider.lineBetween(188, 390, 1092, 390);

    drawPanel(this, 156, 418, 968, 252, t("udp_connect.as_guest"));
    this.add.text(198, 488, t("udp_connect.address"), {
      fontFamily: "Arial, 'Microsoft YaHei', sans-serif",
      fontSize: "18px",
      color: "#f6f1e6",
    });
    const addressField = createTextField(this, 198, 526, 360, {
      value: this.guestAddress,
      maxLength: 64,
      onFocus: (field) => { this.activeField = field; },
      onChange: (value) => { this.guestAddress = value.trim(); },
    });
    this.add.existing(addressField.container);
    this.add.text(198, 590, t("udp_connect.address_tip"), {
      fontFamily: "Arial, 'Microsoft YaHei', sans-serif",
      fontSize: "15px",
      color: "#9fb4c8",
    });
    const clipboardLabel = this.add.text(198, 620, t("udp_connect.connect_clipboard"), {
      fontFamily: "Arial, 'Microsoft YaHei', sans-serif",
      fontSize: "16px",
      color: "#34d399",
    }).setInteractive({ useHandCursor: true });
    clipboardLabel.on("pointerover", () => clipboardLabel.setColor("#ffcf6e"));
    clipboardLabel.on("pointerout", () => clipboardLabel.setColor("#34d399"));
    clipboardLabel.on("pointerup", async () => {
      if (!IS_DESKTOP_APP) return;
      try {
        const text = await navigator.clipboard.readText();
        if (!text.includes(":")) {
          this.showToast(t("udp_connect.address_required"));
          return;
        }
        this.guestAddress = text.trim();
        addressField.setValue(this.guestAddress);
        await this.connectGuest();
      } catch (error) {
        this.showToast(error instanceof Error ? error.message : String(error));
      }
    });
    createFightButton(this, 840, 524, 220, 46, t("udp_connect.connect"), () => void this.connectGuest(), { accent: 0x34d399 });
    createFightButton(this, 840, 586, 220, 46, t("udp_connect.spectate"), () => void this.connectSpectator(), { accent: 0x26c6da });

    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("paste", this.onPaste);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      window.removeEventListener("keydown", this.onKeyDown);
      window.removeEventListener("paste", this.onPaste);
      this.mapDialogContainer?.destroy();
      this.mapDialogContainer = null;
      this.resetSession();
    });
  }

  private showHostMapDialog(): void {
    showMapDialog(this, this.mapDialogContainer, (container) => {
      this.mapDialogContainer = container;
    }, (mapId) => {
      this.selectedMapId = mapId;
      void this.startListening();
    }, {
      confirmLabel: t("udp_connect.start_listen"),
      accent: 0x34d399,
      showCpuLoadout: false,
    });
  }

  private async startListening(): Promise<void> {
    if (!IS_DESKTOP_APP) return;
    const port = Number.parseInt(this.listenPort, 10) || 10800;
    try {
      this.resetSession();
      this.session = new UdpSession("host", {
        onPacket: (addr) => this.showToast(t("udp_connect.received_from", { addr })),
        onMatch: (peer) => this.launchSelection(peer.alias, "Player1"),
        onSpectatorJoin: (spectator) => {
          if (!this.allowSpectators) return;
          this.spectatorNames = this.session?.spectatorNames() ?? [spectator.alias];
          this.renderSpectatorsInWaitDialog();
        },
        onBattleReady: (_peer, loadout) => {
          this.remoteLoadout = loadout;
          this.tryLaunchLoading();
        },
      });
      await this.session.host(port, uiSettings.username);
      this.showWaitingDialog();
    } catch (error) {
      this.showToast(error instanceof Error ? error.message : String(error));
    }
  }

  private async connectGuest(): Promise<void> {
    if (!IS_DESKTOP_APP) return;
    if (!this.guestAddress.includes(":")) {
      this.showToast(t("udp_connect.address_required"));
      return;
    }
    try {
      this.resetSession();
      this.session = new UdpSession("guest", {
        onPacket: (addr) => this.showToast(t("udp_connect.received_from", { addr })),
        onMatch: (peer) => this.launchSelection(peer.alias, "Player2"),
        onBattleReady: (_peer, loadout) => {
          this.remoteLoadout = loadout;
          this.tryLaunchLoading();
        },
      });
      await this.session.connect(this.guestAddress, uiSettings.username);
      this.showToast(t("udp_connect.connect_sent"));
    } catch (error) {
      this.showToast(error instanceof Error ? error.message : String(error));
    }
  }

  private async connectSpectator(): Promise<void> {
    if (!IS_DESKTOP_APP) return;
    if (!this.guestAddress.includes(":")) {
      this.showToast(t("udp_connect.address_required"));
      return;
    }
    try {
      this.resetSession();
      this.session = new UdpSession("guest", {
        onPacket: (addr) => this.showToast(t("udp_connect.received_from", { addr })),
        onSpectatorWelcome: () => {
          const spectatorSession = this.session;
          this.session = null;
          this.scene.start("spectator-loading", {
            source: "udp",
            udpSession: spectatorSession,
          });
        },
      });
      await this.session.connect(this.guestAddress, uiSettings.username, true);
      this.showToast(t("udp_connect.spectate_sent"));
    } catch (error) {
      this.showToast(error instanceof Error ? error.message : String(error));
    }
  }

  private launchSelection(peerName: string, localPlayerId: "Player1" | "Player2"): void {
    if (!this.session || this.currentPeer) {
      return;
    }

    this.waitDialog?.destroy();
    this.waitDialog = null;
    this.matchedPeerName = peerName;
    this.localPlayerId = localPlayerId;
    this.localLoadout = null;
    this.remoteLoadout = null;

    const peer = this.session.createDirectPeer(localPlayerId);
    this.currentPeer = peer;
    this.session.setPeerPacketHandler((message) => peer.handleServerMessage(message));
    peer.start();

    this.scene.switch("select", {
      mode: "local",
      playerName: uiSettings.username,
      opponentName: peerName,
      returnScene: "udp-connect",
      debug: uiSettings.debug,
      onLocalConfirm: (loadout: PlayerLoadout) => {
        this.localLoadout = loadout;
        this.session?.sendBattleReady(loadout);
        this.tryLaunchLoading();
      },
    });
  }

  private resetSession(): void {
    this.session?.close();
    this.session = null;
    this.currentPeer?.close();
    this.currentPeer = null;
    this.matchedPeerName = null;
    this.localLoadout = null;
    this.remoteLoadout = null;
  }

  private tryLaunchLoading(): void {
    if (!this.session || !this.currentPeer || !this.localLoadout || !this.remoteLoadout || !this.matchedPeerName) {
      return;
    }

    const loadouts = this.localPlayerId === "Player1"
      ? { player: this.localLoadout, target: this.remoteLoadout }
      : { player: this.remoteLoadout, target: this.localLoadout };

    this.scene.stop("select");
    this.scene.launch("loading", {
      mode: "local",
      playerName: uiSettings.username,
      opponentName: this.matchedPeerName,
      returnScene: "udp-connect",
      loadouts,
      mapId: this.selectedMapId,
      debug: uiSettings.debug,
      localPlayerId: this.localPlayerId,
      p2p: this.currentPeer,
      spectatorForward: (message: ServerMessage) => this.session?.sendToSpectators(message),
      spectatorCountProvider: () => this.session?.spectatorCount() ?? 0,
    });
    const playerOneLoadout = this.localPlayerId === "Player1" ? this.localLoadout : this.remoteLoadout;
    const playerTwoLoadout = this.localPlayerId === "Player1" ? this.remoteLoadout : this.localLoadout;
    if (!playerOneLoadout || !playerTwoLoadout) return;
    this.session.sendToSpectators({
      type: "battle_start",
      config: {
        battleId: `${Date.now()}`,
        battleMode: "versus",
        mapId: this.selectedMapId,
        seed: 1,
        fps: 60,
        lifeCount: 2,
        defaultBombCount: 3,
        costLimit: 10,
        players: [
          {
            playerId: "Player1",
            username: this.localPlayerId === "Player1" ? uiSettings.username : this.matchedPeerName ?? "",
            loadout: playerOneLoadout,
            spawnPointId: "spawn-1",
          },
          {
            playerId: "Player2",
            username: this.localPlayerId === "Player1" ? this.matchedPeerName ?? "" : uiSettings.username,
            loadout: playerTwoLoadout,
            spawnPointId: "spawn-2",
          },
        ],
      },
    });
  }

  private showWaitingDialog(): void {
    this.waitDialog?.destroy();
    const c = this.add.container(0, 0);
    this.waitDialog = c;
    c.add(this.add.rectangle(640, 360, 1280, 720, 0x000000, 0.62).setInteractive());
    const bg = this.add.graphics();
    drawAngledPanel(bg, 430, 250, 420, 220, 0x111821, 0x34d399, 0.98);
    c.add(bg);
    c.add(this.add.text(640, 320, t("udp_connect.waiting"), {
      fontFamily: "Arial, 'Microsoft YaHei', sans-serif",
      fontSize: "26px",
      fontStyle: "700",
      color: "#f6f1e6",
    }).setOrigin(0.5));
    c.add(createFightButton(this, 640, 410, 160, 46, t("udp_connect.stop"), () => {
      this.resetSession();
      this.waitDialog?.destroy();
      this.waitDialog = null;
    }, { accent: 0xff5c66 }).container);
    this.renderSpectatorsInWaitDialog();
  }

  private renderSpectatorsInWaitDialog(): void {
    const c = this.waitDialog;
    if (!c) return;
    const existing = c.getByName("spectators") as Phaser.GameObjects.Text | null;
    existing?.destroy();
    const text = this.add.text(640, 368, t("udp_connect.spectators", {
      names: this.spectatorNames.length > 0 ? this.spectatorNames.join(", ") : t("udp_connect.no_spectators"),
    }), {
      fontFamily: "Arial, 'Microsoft YaHei', sans-serif",
      fontSize: "15px",
      color: "#b7c7d8",
    }).setOrigin(0.5).setName("spectators");
    c.add(text);
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
