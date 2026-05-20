import Phaser from "phaser";

import {
  createBackButton,
  createFightButton,
  createTextField,
  drawFightingBackdrop,
  drawPanel,
  bodyStyle,
  headingStyle,
} from "./ui";
import { connectionManager, uiSettings, type SceneKey, type TextFieldControl } from "./shared";
import type { ConnectionStatus } from "../network";

export class SettingsScene extends Phaser.Scene {
  private activeField: TextFieldControl | undefined;
  private connectionStatusText!: Phaser.GameObjects.Text;
  private connectBtn!: { setEnabled(enabled: boolean): void; setLabel(label: string): void; container: Phaser.GameObjects.Container };
  private unsubscribeStatus: (() => void) | null = null;

  private readonly onKeyDown = (event: KeyboardEvent) => {
    this.activeField?.handleKey(event);
  };
  private readonly onPaste = (event: ClipboardEvent) => {
    if (!this.activeField) {
      return;
    }
    const text = event.clipboardData?.getData("text") ?? "";
    if (text.length === 0) {
      return;
    }
    this.activeField.handlePaste(text);
    event.preventDefault();
  };

  constructor() {
    super("settings" satisfies SceneKey);
  }

  create(): void {
    drawFightingBackdrop(this, "OPTIONS", "SYSTEM");
    createBackButton(this);
    this.add.text(90, 74, "设置", headingStyle(42));

    drawPanel(this, 74, 150, 354, 448, "通用");
    drawPanel(this, 462, 150, 354, 448, "联机");
    drawPanel(this, 850, 150, 354, 448, "关于");

    // ─── General ───────────────────────────────────

    this.add.text(104, 214, "用户名", bodyStyle("#f6f1e6", 18));
    this.createField(104, 252, 276, "username");

    const debugText = this.add.text(104, 358, "", bodyStyle("#d7e3ef", 18));
    const updateDebug = () => {
      debugText.setText(uiSettings.debug ? "debug 模式：开启" : "debug 模式：关闭");
    };
    updateDebug();
    createFightButton(this, 242, 432, 250, 54, "切换 debug", () => {
      uiSettings.debug = !uiSettings.debug;
      updateDebug();
    }, { accent: 0xf7b733 });

    // ─── Online ────────────────────────────────────

    this.add.text(492, 214, "专用服务器地址", bodyStyle("#f6f1e6", 18));
    this.createField(492, 252, 276, "serverAddress");
    this.add.text(492, 356, "默认监听本地专用服务器", bodyStyle("#b7c7d8", 17));
    this.add.text(492, 396, "默认端口：22334", bodyStyle("#b7c7d8", 17));

    this.connectionStatusText = this.add.text(492, 436, "", bodyStyle("#ffcf6e", 17));
    this.updateConnectionDisplay(connectionManager.status);

    // Connect/disconnect button
    this.connectBtn = createFightButton(this, 613, 510, 250, 50, "", () => this.onToggleConnection(), {
      accent: 0x34d399,
    });

    // Listen for status changes
    this.unsubscribeStatus = connectionManager.addStatusListener((s: ConnectionStatus) => {
      this.updateConnectionDisplay(s);
    });

    // ─── About ─────────────────────────────────────

    this.add.text(880, 214, "staff", bodyStyle("#f6f1e6", 19));
    this.add.text(880, 258, "Design / Code: fxtz-arena team\nUI Scene M5: Phaser only", bodyStyle("#d7e3ef", 17)).setLineSpacing(10);
    this.add.text(880, 386, "项目网址", bodyStyle("#f6f1e6", 19));
    this.add.text(880, 430, "https://github.com/", bodyStyle("#9fd8ff", 17));

    // ─── Keyboard ──────────────────────────────────

    this.input.keyboard?.on("keydown", this.onKeyDown);
    window.addEventListener("paste", this.onPaste);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.input.keyboard?.off("keydown", this.onKeyDown);
      window.removeEventListener("paste", this.onPaste);
      this.activeField = undefined;
      this.unsubscribeStatus?.();
      this.unsubscribeStatus = null;
    });

    // Initial display update
    this.updateConnectionDisplay(connectionManager.status);
  }

  private updateConnectionDisplay(status: ConnectionStatus): void {
    const statusMap: Record<ConnectionStatus, { text: string; color: string }> = {
      disconnected: { text: "连接状态：未连接", color: "#b7c7d8" },
      connecting: { text: "连接状态：正在连接…", color: "#f7b733" },
      connected: { text: `连接状态：已连接 ${connectionManager.serverVersion ? `(v${connectionManager.serverVersion})` : ""}`, color: "#34d399" },
      error: { text: "连接状态：连接失败", color: "#ff5c66" },
    };
    const info = statusMap[status] ?? statusMap.disconnected;
    this.connectionStatusText.setText(info.text).setColor(info.color);

    const isConnected = status === "connected";
    this.connectBtn?.setLabel(isConnected ? "断开连接" : "连接服务器");
  }

  private onToggleConnection(): void {
    if (connectionManager.status === "connected") {
      connectionManager.disconnect();
    } else {
      connectionManager.connect(uiSettings.serverAddress, uiSettings.username);
    }
  }

  private createField(x: number, y: number, width: number, key: "username" | "serverAddress"): void {
    const field = createTextField(this, x, y, width, {
      value: uiSettings[key],
      maxLength: key === "serverAddress" ? 160 : 32,
      onChange: (value) => {
        uiSettings[key] = value;
        if (key === "username") {
          localStorage.setItem("fxtz_username", value);
        } else if (key === "serverAddress") {
          localStorage.setItem("fxtz_server_address", value);
        }
      },
    });
    field.hitArea.on("pointerdown", () => {
      this.activeField?.setActive(false);
      this.activeField = field;
      field.setActive(true);
    });
  }
}
