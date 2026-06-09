import Phaser from "phaser";
import { t } from "@repo/i18n";

import {
  createFightButton,
  drawAngledPanel,
  drawFightingBackdrop,
} from "./ui";
import { connectionManager, installMenuAudioUnlock, type SceneKey, type SelectionData } from "./shared";
import { uiSettings } from "../store/settings";

export class RoomLobbyScene extends Phaser.Scene {
  private contentContainer!: Phaser.GameObjects.Container;
  private statusLabel!: Phaser.GameObjects.Text;
  private startBtn!: ReturnType<typeof createFightButton>;
  private readyBtn!: ReturnType<typeof createFightButton>;
  private leavingOnlineRoom = false;

  /** Track guest's own ready state locally for responsive UI. */
  private selfReady = false;

  constructor() {
    super("lobby" satisfies SceneKey);
  }

  create(): void {
    installMenuAudioUnlock(this);
    this.selfReady = false;
    this.leavingOnlineRoom = false;

    drawFightingBackdrop(this, "LOBBY", "WAITING ROOM");

    this.add.text(90, 74, t("room_lobby.title"), {
      fontFamily: "Arial, 'Microsoft YaHei', sans-serif",
      fontSize: "42px",
      fontStyle: "900",
      color: "#f6f1e6",
    });

    // Custom back button: send leave_room before navigating
    createFightButton(this, 1138, 62, 160, 44, t("menu.back"), () => {
      connectionManager.send({ type: "leave_room" });
      this.scene.start("battle-start");
    }, { accent: 0x5c7185 });

    this.statusLabel = this.add.text(90, 130, "", {
      fontFamily: "Arial, 'Microsoft YaHei', sans-serif",
      fontSize: "14px",
      color: "#b7c7d8",
    });

    this.add.text(356, 92, `#${connectionManager.roomId ?? ""}`, {
      fontFamily: "Arial, 'Microsoft YaHei', sans-serif",
      fontSize: "16px",
      color: "#b7c7d8",
    });
    createFightButton(this, 520, 96, 86, 34, t("room_lobby.copy"), () => {
      void navigator.clipboard?.writeText(connectionManager.roomId ?? "");
      this.showToast(t("room_lobby.copied"));
    }, { accent: 0x5c7185 });

    // Content container for all panels and info text
    this.contentContainer = this.add.container(0, 0);

    // Buttons live at scene level with high depth — never reparented into
    // contentContainer, so they survive re-renders and stay on top of panels.

    this.startBtn = createFightButton(
      this, 640, 640, 220, 50, t("room_lobby.start"), () => {
        connectionManager.send({ type: "start_game" });
      },
      { enabled: false, accent: 0x34d399 },
    );
    this.startBtn.container.setVisible(false);

    this.readyBtn = createFightButton(
      this, 640, 640, 220, 50, t("room_lobby.ready"), () => {
        this.selfReady = !this.selfReady;
        connectionManager.send({ type: "lobby_ready", ready: this.selfReady });
        this.renderLobby();
      },
      { enabled: true, accent: 0x26c6da },
    );
    this.readyBtn.container.setVisible(false);

    // Wire up message handler
    connectionManager.setMessageHandler((msg) => this.onServerMessage(msg));

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      connectionManager.setMessageHandler(null);
    });

    this.renderLobby();
  }

  // ─── Rendering ─────────────────────────────────────────

  private renderLobby(): void {
    // Fully replace content on each render to avoid stale objects
    this.contentContainer.destroy();
    this.contentContainer = this.add.container(0, 0);

    this.statusLabel.setText(
      connectionManager.roomStatus === "waiting"
        ? t("room_lobby.waiting")
        : connectionManager.roomStatus === "selecting"
          ? t("room_lobby.selecting")
          : connectionManager.roomStatus ?? "",
    );

    const isHost = connectionManager.playerId === "Player1";
    const opponentName = connectionManager.opponentUsername;
    const myName = uiSettings.username;

    // ── Left panel: room info ──────────────────────────────
    this.drawPanelToContainer(72, 176, 400, 300, t("room_lobby.room_info"));

    const infoLines: string[] = [];
    if (connectionManager.roomName) infoLines.push(t("room_lobby.room_name", { name: connectionManager.roomName }));
    if (connectionManager.hostName) infoLines.push(t("room_lobby.host", { name: connectionManager.hostName }));
    if (connectionManager.lifeCount !== null) infoLines.push(t("room_lobby.lives", { count: connectionManager.lifeCount }));
    if (connectionManager.costLimit !== null) infoLines.push(t("room_lobby.cost_limit", { count: connectionManager.costLimit }));
    const statusText = connectionManager.roomStatus === "waiting" ? t("room_lobby.status_waiting") : connectionManager.roomStatus === "selecting" ? t("room_lobby.status_selecting") : connectionManager.roomStatus ?? t("room_lobby.status_unknown");
    infoLines.push(t("room_lobby.status", { status: statusText }));

    infoLines.forEach((line, i) => {
      this.contentContainer.add(
        this.add.text(104, 216 + i * 32, line, {
          fontFamily: "Arial, 'Microsoft YaHei', sans-serif",
          fontSize: "16px",
          color: "#f6f1e6",
        }),
      );
    });

    // ── Right panel: player slots ──────────────────────────
    this.drawPanelToContainer(548, 176, 660, 360, t("room_lobby.players"));

    if (isHost) {
      // 1P = self (green), 2P = opponent (no subtitle)
      this.drawPlayerSlot(556, 208, "1P", myName, t("room_lobby.host_badge"), true, true);
      const guestOccupied = !!opponentName;
      this.drawPlayerSlot(556, 332, "2P", opponentName ?? t("room_lobby.waiting"), "", guestOccupied, false);
    } else {
      // 1P = host (shows t("room_lobby.host_badge")), 2P = self (green, no subtitle)
      this.drawPlayerSlot(556, 208, "1P", connectionManager.hostName ?? t("room_lobby.default_player"), t("room_lobby.host_badge"), true, false);
      const guestOccupied = !!opponentName;
      this.drawPlayerSlot(556, 332, "2P", myName, "", guestOccupied, true);
    }

    this.contentContainer.add(
      this.add.text(582, 470, t("room_lobby.spectator_seats"), {
        fontFamily: "Arial, 'Microsoft YaHei', sans-serif",
        fontSize: "15px",
        color: "#ffcf6e",
      }),
    );
    this.contentContainer.add(
      this.add.text(720, 470, formatSpectatorNames(connectionManager.spectatorNames), {
        fontFamily: "Arial, 'Microsoft YaHei', sans-serif",
        fontSize: "15px",
        color: "#d7e3ef",
      }).setWordWrapWidth(450),
    );

    // ── Bottom status text and buttons ──────────────────────
    if (isHost) {
      this.startBtn.container.setVisible(true);
      this.readyBtn.container.setVisible(false);
      const canStart = !!opponentName && (connectionManager.opponentReady === true);
      this.startBtn.setEnabled(canStart);

      const hint = !opponentName ? t("room_lobby.wait_opponent")
        : !connectionManager.opponentReady ? t("room_lobby.wait_ready")
          : "";
      if (hint) {
        this.contentContainer.add(
          this.add.text(640, 610, hint, {
            fontFamily: "Arial, 'Microsoft YaHei', sans-serif",
            fontSize: "14px",
            color: "#f7b733",
          }).setOrigin(0.5),
        );
      }
    } else {
      this.startBtn.container.setVisible(false);
      this.readyBtn.container.setVisible(true);
      this.readyBtn.setLabel(this.selfReady ? t("room_lobby.cancel_ready") : t("room_lobby.ready"));

      this.contentContainer.add(
        this.add.text(640, 610, this.selfReady ? t("room_lobby.ready_wait_start") : t("room_lobby.ready_hint"), {
          fontFamily: "Arial, 'Microsoft YaHei', sans-serif",
          fontSize: "14px",
          color: "#b7c7d8",
        }).setOrigin(0.5),
      );
    }
  }

  /** Draw an angled panel as a child of contentContainer. */
  private drawPanelToContainer(x: number, y: number, width: number, height: number, title: string): void {
    const g = this.add.graphics();
    drawAngledPanel(g, x, y, width, height, 0x101820, 0x34475c, 0.88);
    this.contentContainer.add(g);
    this.contentContainer.add(
      this.add.text(x + 26, y + 18, title, {
        fontFamily: "Arial, 'Microsoft YaHei', sans-serif",
        fontSize: "18px",
        color: "#ffcf6e",
      }),
    );
  }

  private drawPlayerSlot(x: number, y: number, label: string, name: string, subtitle: string, occupied: boolean, selfSlot: boolean): void {
    const g = this.add.graphics();
    drawAngledPanel(g, x, y, 640, 104, occupied ? 0x18212d : 0x0f141d, occupied ? 0x5c7185 : 0x34475c, 0.95);
    this.contentContainer.add(g);

    const avatar = this.add.graphics();
    avatar.fillStyle(occupied ? 0x5c7185 : 0x34475c, 1);
    avatar.fillCircle(x + 52, y + 52, 36);
    avatar.lineStyle(2, selfSlot ? 0x34d399 : (occupied ? 0xffcf6e : 0x5c7185), 1);
    avatar.strokeCircle(x + 52, y + 52, 36);
    this.contentContainer.add(avatar);

    this.contentContainer.add(
      this.add.text(x + 26, y + 12, label, {
        fontFamily: "Arial, 'Microsoft YaHei', sans-serif",
        fontSize: "14px",
        fontStyle: "700",
        color: occupied ? "#ffcf6e" : "#5c7185",
      }),
    );
    this.contentContainer.add(
      this.add.text(x + 110, y + 24, name, {
        fontFamily: "Arial, 'Microsoft YaHei', sans-serif",
        fontSize: "24px",
        fontStyle: "700",
        color: selfSlot ? "#34d399" : (occupied ? "#f6f1e6" : "#68717b"),
      }),
    );
    if (subtitle) {
      this.contentContainer.add(
        this.add.text(x + 110, y + 56, subtitle, {
          fontFamily: "Arial, 'Microsoft YaHei', sans-serif",
          fontSize: "16px",
          color: occupied ? "#9fb4c8" : "#4a535d",
        }),
      );
    }
  }

  // ─── Server message handling ─────────────────────────

  private onServerMessage(msg: unknown): void {
    const m = msg as Record<string, unknown>;
    switch (m.type) {
      case "room_state": {
        const rs = m as { playerCount?: number };
        if (rs.playerCount !== undefined && rs.playerCount < 2 && connectionManager.playerId !== "Player1") {
          this.leaveOnlineRoomView();
          return;
        }
        this.renderLobby();
        break;
      }
      case "game_starting":
        this.scene.start("select", {
          mode: "online",
          roomId: connectionManager.roomId ?? undefined,
          playerId: connectionManager.playerId ?? undefined,
        } satisfies SelectionData);
        break;
      case "peer_status": {
        const ps = m as { playerId?: string; status?: string };
        if (ps.status === "disconnected" && ps.playerId === "Player1") {
          this.leaveOnlineRoomView();
          return;
        }
        this.renderLobby();
        break;
      }
      case "error": {
        const code = m.code as string;
        const message = m.message as string;
        this.showToast(`${code}: ${message}`);
        break;
      }
    }
  }

  private leaveOnlineRoomView(): void {
    if (this.leavingOnlineRoom) return;
    this.leavingOnlineRoom = true;
    this.showToast(t("room_lobby.peer_left"));
    this.time.delayedCall(150, () => {
      if (this.scene.isActive("lobby")) {
        this.scene.start("battle-start");
      }
    });
  }

  // ─── Toast notification ──────────────────────────────

  private showToast(message: string): void {
    const toast = this.add.text(640, 660, message, {
      fontFamily: "Arial, 'Microsoft YaHei', sans-serif",
      fontSize: "16px",
      color: "#ffcf6e",
      backgroundColor: "#111821ee",
      padding: { x: 16, y: 8 },
    }).setOrigin(0.5).setAlpha(0);
    this.tweens.add({
      targets: toast,
      alpha: 1,
      duration: 200,
      yoyo: true,
      hold: 2000,
      onComplete: () => toast.destroy(),
    });
  }
}

function formatSpectatorNames(names: readonly string[]): string {
  return names.length > 0 ? names.join(", ") : t("room_lobby.no_spectators");
}
