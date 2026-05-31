import Phaser from "phaser";

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

    this.add.text(90, 74, "等待房间", {
      fontFamily: "Arial, 'Microsoft YaHei', sans-serif",
      fontSize: "42px",
      fontStyle: "900",
      color: "#f6f1e6",
    });

    // Custom back button: send leave_room before navigating
    createFightButton(this, 1138, 62, 160, 44, "返回", () => {
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
    createFightButton(this, 520, 96, 86, 34, "复制", () => {
      void navigator.clipboard?.writeText(connectionManager.roomId ?? "");
      this.showToast("已复制房间号");
    }, { accent: 0x5c7185 });

    // Content container for all panels and info text
    this.contentContainer = this.add.container(0, 0);

    // Buttons live at scene level with high depth — never reparented into
    // contentContainer, so they survive re-renders and stay on top of panels.

    this.startBtn = createFightButton(
      this, 640, 640, 220, 50, "开始游戏", () => {
        connectionManager.send({ type: "start_game" });
      },
      { enabled: false, accent: 0x34d399 },
    );
    this.startBtn.container.setVisible(false);

    this.readyBtn = createFightButton(
      this, 640, 640, 220, 50, "准备", () => {
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
        ? "等待中…"
        : connectionManager.roomStatus === "selecting"
          ? "正在选择配装…"
          : connectionManager.roomStatus ?? "",
    );

    const isHost = connectionManager.playerId === "Player1";
    const opponentName = connectionManager.opponentUsername;
    const myName = uiSettings.username;

    // ── Left panel: room info ──────────────────────────────
    this.drawPanelToContainer(72, 176, 400, 300, "房间信息");

    const infoLines: string[] = [];
    if (connectionManager.roomName) infoLines.push(`房间名: ${connectionManager.roomName}`);
    if (connectionManager.hostName) infoLines.push(`房主: ${connectionManager.hostName}`);
    if (connectionManager.lifeCount !== null) infoLines.push(`命数: ${connectionManager.lifeCount}`);
    if (connectionManager.costLimit !== null) infoLines.push(`Cost 上限: ${connectionManager.costLimit}`);
    const statusText = connectionManager.roomStatus === "waiting" ? "等待中" : connectionManager.roomStatus === "selecting" ? "配装中" : connectionManager.roomStatus ?? "未知";
    infoLines.push(`状态: ${statusText}`);

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
    this.drawPanelToContainer(548, 176, 660, 300, "玩家");

    if (isHost) {
      // 1P = self (green), 2P = opponent (no subtitle)
      this.drawPlayerSlot(556, 208, "1P", myName, "房主", true, true);
      const guestOccupied = !!opponentName;
      this.drawPlayerSlot(556, 332, "2P", opponentName ?? "等待中…", "", guestOccupied, false);
    } else {
      // 1P = host (shows "房主"), 2P = self (green, no subtitle)
      this.drawPlayerSlot(556, 208, "1P", connectionManager.hostName ?? "玩家-1", "房主", true, false);
      const guestOccupied = !!opponentName;
      this.drawPlayerSlot(556, 332, "2P", myName, "", guestOccupied, true);
    }

    // ── Bottom status text and buttons ──────────────────────
    if (isHost) {
      this.startBtn.container.setVisible(true);
      this.readyBtn.container.setVisible(false);
      const canStart = !!opponentName && (connectionManager.opponentReady === true);
      this.startBtn.setEnabled(canStart);

      const hint = !opponentName ? "等待对手加入…"
        : !connectionManager.opponentReady ? "等待对手准备…"
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
      this.readyBtn.setLabel(this.selfReady ? "取消准备" : "准备");

      this.contentContainer.add(
        this.add.text(640, 610, this.selfReady ? "已准备，等待房主开始游戏" : "准备好后请点击准备", {
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
    this.showToast("对方已经退出房间");
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
