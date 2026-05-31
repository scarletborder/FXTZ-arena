import Phaser from "phaser";
import { MAX_ROOM_NAME_LENGTH } from "@repo/constants";
import type { PlayerId } from "@repo/types";

import type { ConnectionStatus } from "../network";
import { uiSettings } from "../store/settings";
import { connectionManager, type SceneKey, type SelectionData, type TextFieldControl } from "./shared";
import { createBackButton, createFightButton, createTextField, drawAngledPanel, drawFightingBackdrop, drawPanel } from "./ui";

export class BattleStartScene extends Phaser.Scene {
  private indicator!: Phaser.GameObjects.Graphics;
  private statusLabel!: Phaser.GameObjects.Text;
  private quickMatchBtn!: { setEnabled(enabled: boolean): void; container: Phaser.GameObjects.Container };
  private createRoomBtn!: { setEnabled(enabled: boolean): void; container: Phaser.GameObjects.Container };
  private roomListBtn!: { setEnabled(enabled: boolean): void; container: Phaser.GameObjects.Container };
  private formContainer: Phaser.GameObjects.Container | null = null;
  private activeField: TextFieldControl | null = null;
  private unsubscribeStatus: (() => void) | null = null;

  private readonly onKeyDown = (event: KeyboardEvent) => this.activeField?.handleKey(event);
  private readonly onPaste = (event: ClipboardEvent) => this.activeField?.handlePaste(event.clipboardData?.getData("text") ?? "");

  constructor() {
    super("battle-start" satisfies SceneKey);
  }

  create(): void {
    drawFightingBackdrop(this, "BATTLE", "VERSUS ENTRY");
    createBackButton(this);
    this.add.text(90, 74, "开始战斗", { fontFamily: "Arial, 'Microsoft YaHei', sans-serif", fontSize: "42px", fontStyle: "900", color: "#f6f1e6" });

    this.indicator = this.add.graphics();
    this.statusLabel = this.add.text(90, 130, "", { fontFamily: "Arial, 'Microsoft YaHei', sans-serif", fontSize: "14px", color: "#b7c7d8" });
    this.drawIndicator("disconnected");

    drawPanel(this, 72, 176, 520, 432, "ONLINE");
    drawPanel(this, 686, 176, 520, 432, "LOCAL");
    this.quickMatchBtn = createFightButton(this, 332, 272, 330, 70, "快速匹配", () => this.onQuickMatch(), { enabled: false, subLabel: "匹配一个公开房间" });
    this.createRoomBtn = createFightButton(this, 332, 374, 330, 70, "创建房间", () => this.onCreateRoom(), { enabled: false, subLabel: "设置后等待对手加入" });
    this.roomListBtn = createFightButton(this, 332, 476, 330, 70, "房间列表", () => this.scene.start("room-list"), { enabled: false, subLabel: "浏览公开和加密房间" });

    createFightButton(this, 946, 298, 360, 86, "人机对战", () => this.scene.start("select", { mode: "ai" } satisfies SelectionData), { subLabel: "选择配装后开战", accent: 0xe33d44 });
    createFightButton(this, 946, 416, 360, 86, "靶场", () => this.scene.start("select", { mode: "training" } satisfies SelectionData), { subLabel: "无 cost 上限", accent: 0x26c6da });
    createFightButton(this, 946, 534, 360, 86, "本地局域网游玩", () => this.scene.start("local-lan"), { subLabel: "发现局域网玩家", accent: 0xffcf6e });

    const updateConnectionState = (s: ConnectionStatus) => {
      const connected = s === "connected";
      this.drawIndicator(s);
      this.quickMatchBtn.setEnabled(connected);
      this.createRoomBtn.setEnabled(connected);
      this.roomListBtn.setEnabled(connected);
    };
    this.unsubscribeStatus = connectionManager.addStatusListener(updateConnectionState);
    updateConnectionState(connectionManager.status);
    connectionManager.setMessageHandler((msg) => this.onServerMessage(msg));
    connectionManager.connect(uiSettings.serverAddress, uiSettings.username);

    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("paste", this.onPaste);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      connectionManager.setMessageHandler(null);
      this.unsubscribeStatus?.();
      this.unsubscribeStatus = null;
      window.removeEventListener("keydown", this.onKeyDown);
      window.removeEventListener("paste", this.onPaste);
    });
  }

  private drawIndicator(status: ConnectionStatus): void {
    this.indicator.clear();
    const color = status === "connected" ? 0x34d399 : status === "connecting" ? 0xf7b733 : 0xff5c66;
    this.indicator.fillStyle(color, 1);
    this.indicator.fillCircle(96, 142, 5);
    this.statusLabel.setText(status === "connected" ? `已连接${connectionManager.serverVersion ? ` (${connectionManager.serverVersion})` : ""}` : status === "connecting" ? "正在连接..." : status === "error" ? "连接失败" : "未连接");
  }

  private onServerMessage(msg: unknown): void {
    const m = msg as Record<string, unknown>;
    if (m.type === "room_joined") {
      const playerId = m.playerId as PlayerId;
      const roomId = m.roomId as string;
      if (playerId && roomId) this.scene.start("lobby", { mode: "online", roomId, playerId } satisfies SelectionData);
    } else if (m.type === "error") {
      this.showToast(`${String(m.code)}: ${String(m.message)}`);
    }
  }

  private onQuickMatch(): void {
    connectionManager.send({ type: "quick_match", username: uiSettings.username, p2pEnabled: uiSettings.p2pEnabled });
    this.showToast("正在匹配...");
  }

  private onCreateRoom(): void {
    if (this.formContainer) {
      this.formContainer.destroy();
      this.formContainer = null;
      this.activeField = null;
      return;
    }
    this.showCreateRoomForm();
  }

  private showCreateRoomForm(): void {
    const cx = 640;
    const cy = 420;
    const c = this.add.container(0, 0);
    this.formContainer = c;
    c.add(this.add.rectangle(cx, cy, 1280, 720, 0x000000, 0.6).setInteractive());
    const pw = 420;
    const ph = 360;
    const px = cx - pw / 2;
    const py = cy - ph / 2;
    const bg = this.add.graphics();
    drawAngledPanel(bg, px, py, pw, ph, 0x111821, 0x5c7185, 0.98);
    c.add(bg);
    c.add(this.add.text(cx, py + 28, "创建房间", { fontFamily: "Arial, 'Microsoft YaHei', sans-serif", fontSize: "22px", fontStyle: "700", color: "#ffcf6e" }).setOrigin(0.5));
    let roomName = Array.from(`${uiSettings.username} 的房间`).slice(0, MAX_ROOM_NAME_LENGTH).join("");
    let roomPassword = "";
    c.add(this.add.text(cx - 140, py + 78, "房间名", { fontFamily: "Arial, 'Microsoft YaHei', sans-serif", fontSize: "16px", color: "#f6f1e6" }));
    const nameField = createTextField(this, cx - 140, py + 108, 280, {
      value: roomName,
      maxLength: MAX_ROOM_NAME_LENGTH,
      onFocus: (field) => { this.activeField = field; },
      onChange: (v) => { roomName = v; },
    });
    c.add(nameField.container);
    this.activeField = nameField;
    c.add(this.add.text(cx - 140, py + 158, "密码(可选)", { fontFamily: "Arial, 'Microsoft YaHei', sans-serif", fontSize: "16px", color: "#f6f1e6" }));
    const passwordField = createTextField(this, cx - 140, py + 188, 280, {
      value: roomPassword,
      onFocus: (field) => { this.activeField = field; },
      onChange: (v) => { roomPassword = v; },
    });
    c.add(passwordField.container);
    c.add(this.add.text(cx + 20, py + 248, "命数", { fontFamily: "Arial, 'Microsoft YaHei', sans-serif", fontSize: "16px", color: "#f6f1e6" }));
    const lifeLabel = this.add.text(cx + 140, py + 248, "2", { fontFamily: "Arial, 'Microsoft YaHei', sans-serif", fontSize: "16px", color: "#34d399" });
    c.add(lifeLabel);
    c.add(this.add.text(cx + 100, py + 248, "<", { fontFamily: "Arial", fontSize: "16px", color: "#b7c7d8" }).setInteractive({ useHandCursor: true }).on("pointerdown", () => lifeLabel.setText(String(Math.max(1, parseInt(lifeLabel.text, 10) - 1)))));
    c.add(this.add.text(cx + 164, py + 248, ">", { fontFamily: "Arial", fontSize: "16px", color: "#b7c7d8" }).setInteractive({ useHandCursor: true }).on("pointerdown", () => lifeLabel.setText(String(Math.min(9, parseInt(lifeLabel.text, 10) + 1)))));
    c.add(createFightButton(this, cx - 80, py + ph - 60, 140, 44, "创建", () => {
      connectionManager.send({ type: "create_room", name: roomName, username: uiSettings.username, password: roomPassword || undefined, mapId: "arena_standard", lifeCount: parseInt(lifeLabel.text, 10), costLimit: 10, p2pEnabled: uiSettings.p2pEnabled });
      c.destroy();
      this.formContainer = null;
      this.activeField = null;
      this.showToast("正在创建房间...");
    }, { accent: 0x34d399 }).container);
    c.add(createFightButton(this, cx + 80, py + ph - 60, 140, 44, "取消", () => {
      c.destroy();
      this.formContainer = null;
      this.activeField = null;
    }, { accent: 0x5c7185 }).container);
  }

  private showToast(message: string): void {
    const toast = this.add.text(640, 660, message, { fontFamily: "Arial, 'Microsoft YaHei', sans-serif", fontSize: "16px", color: "#ffcf6e", backgroundColor: "#111821ee", padding: { x: 16, y: 8 } }).setOrigin(0.5).setAlpha(0);
    this.tweens.add({ targets: toast, alpha: 1, duration: 200, yoyo: true, hold: 2000, onComplete: () => toast.destroy() });
  }
}
