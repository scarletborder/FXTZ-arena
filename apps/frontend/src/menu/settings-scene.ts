import Phaser from "phaser";

import {
  createBackButton,
  createFightButton,
  createTextField,
  drawBuildLabel,
  drawFightingBackdrop,
  drawPanel,
  bodyStyle,
  headingStyle,
} from "./ui";
import { connectionManager, type SceneKey, type TextFieldControl } from "./shared";
import {
  setDebug,
  setMusicVolume,
  setServerAddress,
  setSoundVolume,
  setUsername,
  uiSettings,
} from "../store/settings";
import type { ConnectionStatus } from "../network";

interface SliderControl {
  readonly container: Phaser.GameObjects.Container;
  setValue(value: number): void;
}

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

    this.add.text(104, 310, "音乐", bodyStyle("#f6f1e6", 18));
    this.createVolumeSlider(104, 344, 276, uiSettings.music, setMusicVolume);

    this.add.text(104, 386, "音效", bodyStyle("#f6f1e6", 18));
    this.createVolumeSlider(104, 420, 276, uiSettings.sound, setSoundVolume);

    const debugText = this.add.text(104, 476, "", bodyStyle("#d7e3ef", 18));
    const updateDebug = () => {
      debugText.setText(uiSettings.debug ? "debug 模式：开启" : "debug 模式：关闭");
    };
    updateDebug();
    createFightButton(this, 242, 534, 250, 54, "切换 debug", () => {
      setDebug(!uiSettings.debug);
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
    this.add.text(880, 258, "Design / Code: scarletborder\nUI Scene: Phaser4\nPhysics: Rapier-2d", bodyStyle("#d7e3ef", 17)).setLineSpacing(10);
    this.add.text(880, 386, "项目网址", bodyStyle("#f6f1e6", 19));
    this.add.text(880, 430, "github.com/scarletborder/FXTZ-arena", bodyStyle("#9fd8ff", 17));
    this.add.text(880, 500, "版本", bodyStyle("#f6f1e6", 19));
    drawBuildLabel(this, 1174, 548);

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
      connected: { text: `连接状态：已连接 ${connectionManager.serverVersion ? `(${connectionManager.serverVersion})` : ""}`, color: "#34d399" },
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

  private activateField(field: TextFieldControl): void {
    if (this.activeField === field) {
      return;
    }
    this.activeField?.setActive(false);
    this.activeField = field;
    field.setActive(true);
  }

  private createField(x: number, y: number, width: number, key: "username" | "serverAddress"): void {
    const field = createTextField(this, x, y, width, {
      value: uiSettings[key],
      maxLength: key === "serverAddress" ? 160 : 32,
      onFocus: (focusedField) => {
        this.activateField(focusedField);
      },
      onChange: (value) => {
        if (key === "username") {
          setUsername(value);
        } else if (key === "serverAddress") {
          setServerAddress(value);
        }
      },
    });
    field.hitArea.on("pointerdown", () => {
      this.activateField(field);
    });
  }

  private createVolumeSlider(
    x: number,
    y: number,
    width: number,
    value: number,
    onChange: (value: number) => void,
  ): SliderControl {
    const height = 28;
    const container = this.add.container(x, y);
    const track = this.add.graphics();
    const valueText = this.add.text(width, -2, "0", bodyStyle("#9fd8ff", 17)).setOrigin(1, 0);
    const hitArea = this.add.rectangle(0, 0, width, height, 0xffffff, 0.001)
      .setOrigin(0, 0)
      .setInteractive({ useHandCursor: true });
    let currentValue = clampVolume(value);
    let hovering = false;
    let dragging = false;

    const draw = () => {
      const ratio = currentValue / 100;
      const fillWidth = Math.max(0, Math.round(width * ratio));
      const handleX = Math.round(fillWidth);

      track.clear();
      track.lineStyle(2, dragging || hovering ? 0xffcf6e : 0x5c7185, 1);
      track.strokeRect(0, 12, width, 10);
      track.fillStyle(0x101820, 1);
      track.fillRect(1, 13, width - 2, 8);
      track.fillStyle(0x34d399, 0.9);
      track.fillRect(1, 13, Math.max(0, fillWidth - 2), 8);
      track.fillStyle(0xf6f1e6, dragging || hovering ? 1 : 0.88);
      track.fillCircle(handleX, 17, dragging || hovering ? 9 : 8);

      valueText.setText(String(currentValue));
      valueText.setColor(dragging || hovering ? "#ffcf6e" : "#9fd8ff");
    };

    const updateFromPointer = (pointer: Phaser.Input.Pointer) => {
      const localX = Phaser.Math.Clamp(pointer.x - x, 0, width);
      const nextValue = Math.round((localX / width) * 100);
      if (nextValue !== currentValue) {
        currentValue = nextValue;
        onChange(currentValue);
        draw();
      }
    };

    hitArea.on("pointerover", () => {
      hovering = true;
      draw();
    });
    hitArea.on("pointerout", () => {
      hovering = false;
      if (!dragging) {
        draw();
      }
    });
    hitArea.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      dragging = true;
      updateFromPointer(pointer);
      draw();
    });

    const onPointerMove = (pointer: Phaser.Input.Pointer) => {
      if (dragging && pointer.isDown) {
        updateFromPointer(pointer);
      }
    };
    const onPointerUp = () => {
      if (!dragging) {
        return;
      }
      dragging = false;
      draw();
    };

    this.input.on("pointermove", onPointerMove);
    this.input.on("pointerup", onPointerUp);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.input.off("pointermove", onPointerMove);
      this.input.off("pointerup", onPointerUp);
    });

    container.add([track, valueText, hitArea]);
    draw();
    onChange(currentValue);

    return {
      container,
      setValue(nextValue: number): void {
        currentValue = clampVolume(nextValue);
        onChange(currentValue);
        draw();
      },
    };
  }
}

function clampVolume(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}
