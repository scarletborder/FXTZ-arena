import Phaser from "phaser";

import {
  createBackButton,
  createFightButton,
  createTextField,
  drawAngledPanel,
  drawFightingBackdrop,
  drawPanel,
} from "./ui";
import { connectionManager, uiSettings, type SceneKey, type SelectionData } from "./shared";
import type { ConnectionStatus } from "../network";
import type { PlayerId } from "@repo/types";

export class BattleStartScene extends Phaser.Scene {
  private indicator!: Phaser.GameObjects.Graphics;
  private statusLabel!: Phaser.GameObjects.Text;
  private quickMatchBtn!: { setEnabled(enabled: boolean): void; container: Phaser.GameObjects.Container };
  private createRoomBtn!: { setEnabled(enabled: boolean): void; container: Phaser.GameObjects.Container };
  private formContainer: Phaser.GameObjects.Container | null = null;
  private connected = false;

  constructor() {
    super("battle-start" satisfies SceneKey);
  }

  create(): void {
    drawFightingBackdrop(this, "BATTLE", "VERSUS ENTRY");
    createBackButton(this);

    this.add.text(90, 74, "开始战斗", {
      fontFamily: "Arial, 'Microsoft YaHei', sans-serif",
      fontSize: "42px",
      fontStyle: "900",
      color: "#f6f1e6",
    });

    // Connection indicator
    this.indicator = this.add.graphics();
    this.statusLabel = this.add.text(90, 130, "", {
      fontFamily: "Arial, 'Microsoft YaHei', sans-serif",
      fontSize: "14px",
      color: "#b7c7d8",
    });
    this.drawIndicator("disconnected");

    drawPanel(this, 72, 176, 520, 432, "ONLINE");
    drawPanel(this, 686, 176, 520, 432, "LOCAL");

    this.quickMatchBtn = createFightButton(this, 332, 272, 330, 70, "快速匹配", () => this.onQuickMatch(), {
      enabled: false,
      subLabel: "匹配一名对手",
    });
    this.createRoomBtn = createFightButton(this, 332, 374, 330, 70, "创建房间", () => this.onCreateRoom(), {
      enabled: false,
      subLabel: "设置后等待对手加入",
    });
    createFightButton(this, 332, 476, 330, 70, "房间列表", () => this.onRoomList(), {
      enabled: false,
      subLabel: "M5 占位 — 待房间列表 UI",
    });

    createFightButton(this, 946, 318, 360, 86, "人机对战", () => this.scene.start("select", { mode: "ai" } satisfies SelectionData), {
      subLabel: "选择配装后开战",
      accent: 0xe33d44,
    });
    createFightButton(this, 946, 446, 360, 86, "靶场", () => this.scene.start("select", { mode: "training" } satisfies SelectionData), {
      subLabel: "无 cost 上限",
      accent: 0x26c6da,
    });

    // Wire up connection manager
    connectionManager.onStatusChange = (s: ConnectionStatus) => {
      this.drawIndicator(s);
      this.connected = s === "connected";
      this.quickMatchBtn.setEnabled(this.connected);
      this.createRoomBtn.setEnabled(this.connected);
    };
    connectionManager.setMessageHandler((msg) => this.onServerMessage(msg));

    // Initial connection
    connectionManager.connect(uiSettings.serverAddress, uiSettings.username);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      connectionManager.setMessageHandler(null);
      connectionManager.onStatusChange = null;
    });
  }

  // ─── Connection indicator ────────────────────────────

  private drawIndicator(status: ConnectionStatus): void {
    this.indicator.clear();
    const color = status === "connected" ? 0x34d399 : status === "connecting" ? 0xf7b733 : 0xff5c66;
    this.indicator.fillStyle(color, 1);
    this.indicator.fillCircle(96, 142, 5);
    this.statusLabel.setText(
      status === "connected"
        ? `已连接 ${connectionManager.serverVersion ? `(v${connectionManager.serverVersion})` : ""}`
        : status === "connecting"
          ? "正在连接…"
          : status === "error"
            ? "连接失败"
            : "未连接",
    );
  }

  // ─── Server message handling ─────────────────────────

  private onServerMessage(msg: unknown): void {
    const m = msg as Record<string, unknown>;
    switch (m.type) {
      case "room_joined": {
        const playerId = m.playerId as PlayerId;
        const roomId = m.roomId as string;
        if (playerId && roomId) {
          this.scene.start("lobby", {
            mode: "online",
            roomId,
            playerId,
          } satisfies SelectionData);
        }
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

  // ─── Online actions ──────────────────────────────────

  private onQuickMatch(): void {
    connectionManager.send({ type: "quick_match" });
    this.showToast("正在匹配…");
  }

  private onCreateRoom(): void {
    if (this.formContainer) {
      this.formContainer.destroy();
      this.formContainer = null;
      return;
    }
    this.showCreateRoomForm();
  }

  private onRoomList(): void {
    this.showToast("房间列表 — M5 占位，待联机 UI");
  }

  // ─── Create room form ────────────────────────────────

  private showCreateRoomForm(): void {
    const cx = 640;
    const cy = 420;
    const c = this.add.container(0, 0);
    this.formContainer = c;

    // Overlay
    const overlay = this.add.rectangle(cx, cy, 1280, 720, 0x000000, 0.6).setInteractive();
    c.add(overlay);

    // Panel
    const pw = 420;
    const ph = 360;
    const px = cx - pw / 2;
    const py = cy - ph / 2;
    const bg = this.add.graphics();
    drawAngledPanel(bg, px, py, pw, ph, 0x111821, 0x5c7185, 0.98);
    c.add(bg);

    c.add(
      this.add.text(cx, py + 28, "创建房间", {
        fontFamily: "Arial, 'Microsoft YaHei', sans-serif",
        fontSize: "22px",
        fontStyle: "700",
        color: "#ffcf6e",
      }).setOrigin(0.5),
    );

    // Track form values
    let roomName = `${uiSettings.username} 的房间`;
    let roomPassword = "";

    // Room name field
    c.add(this.add.text(cx - 140, py + 78, "房间名", { fontFamily: "Arial, 'Microsoft YaHei', sans-serif", fontSize: "16px", color: "#f6f1e6" }));
    c.add(createTextField(this, cx - 140, py + 108, 280, {
      value: roomName,
      onChange: (v: string) => { roomName = v; },
    }).container);

    // Password field
    c.add(this.add.text(cx - 140, py + 158, "密码（可选）", { fontFamily: "Arial, 'Microsoft YaHei', sans-serif", fontSize: "16px", color: "#f6f1e6" }));
    c.add(createTextField(this, cx - 140, py + 188, 280, {
      value: roomPassword,
      onChange: (v: string) => { roomPassword = v; },
    }).container);

    // Life count
    c.add(this.add.text(cx + 20, py + 248, "命数", { fontFamily: "Arial, 'Microsoft YaHei', sans-serif", fontSize: "16px", color: "#f6f1e6" }));
    const lifeLabel = this.add.text(cx + 140, py + 248, "2", { fontFamily: "Arial, 'Microsoft YaHei', sans-serif", fontSize: "16px", color: "#34d399" });
    const lifeDec = this.add.text(cx + 100, py + 248, "◀", { fontFamily: "Arial", fontSize: "16px", color: "#b7c7d8" }).setInteractive({ useHandCursor: true }).on("pointerdown", () => {
      const v = Math.max(1, parseInt(lifeLabel.text, 10) - 1);
      lifeLabel.setText(String(v));
    });
    const lifeInc = this.add.text(cx + 164, py + 248, "▶", { fontFamily: "Arial", fontSize: "16px", color: "#b7c7d8" }).setInteractive({ useHandCursor: true }).on("pointerdown", () => {
      const v = Math.min(9, parseInt(lifeLabel.text, 10) + 1);
      lifeLabel.setText(String(v));
    });
    c.add(lifeDec);
    c.add(lifeInc);
    c.add(lifeLabel);

    // Confirm / cancel buttons
    const confirmBtn = createFightButton(this, cx - 80, py + ph - 60, 140, 44, "创建", () => {
      connectionManager.send({
        type: "create_room",
        name: roomName,
        password: roomPassword || undefined,
        mapId: "arena_standard",
        lifeCount: parseInt(lifeLabel.text, 10),
        costLimit: 10,
      });

      c.destroy();
      this.formContainer = null;
      this.showToast("正在创建房间…");
    }, { accent: 0x34d399 });
    c.add(confirmBtn.container);

    const cancelBtn = createFightButton(this, cx + 80, py + ph - 60, 140, 44, "取消", () => {
      c.destroy();
      this.formContainer = null;
    }, { accent: 0x5c7185 });
    c.add(cancelBtn.container);
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
