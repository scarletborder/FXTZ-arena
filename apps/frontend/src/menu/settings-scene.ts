import Phaser from "phaser";
import { MAX_PLAYER_NAME_LENGTH, PUBLIC_SERVER } from "@repo/constants";

import {
  createBackButton,
  createFightButton,
  createTextField,
  drawAngledPanel,
  drawBuildLabel,
  drawFightingBackdrop,
  drawPanel,
  bodyStyle,
  headingStyle,
} from "./ui";
import { connectionManager, type FightButton, type SceneKey, type TextFieldControl } from "./shared";
import {
  setDebug,
  setMusicVolume,
  setServerAddress,
  setSoundVolume,
  setUsername,
  uiSettings,
} from "../store/settings";
import type { ConnectionStatus } from "../network";
import { showPublicServerConnectivityDialog } from "./public-server-connectivity-dialog";

interface SliderControl {
  readonly container: Phaser.GameObjects.Container;
  setValue(value: number): void;
}

export class SettingsScene extends Phaser.Scene {
  private activeField: TextFieldControl | undefined;
  private serverAddressField: TextFieldControl | undefined;
  private publicServerDialog: Phaser.GameObjects.Container | undefined;
  private publicServerConnectivityDialog: Phaser.GameObjects.Container | undefined;
  private connectionStatusText: Phaser.GameObjects.Text | undefined;
  private connectBtn: FightButton | undefined;
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

  init(): void {
    this.activeField = undefined;
    this.serverAddressField = undefined;
    this.publicServerDialog = undefined;
    this.publicServerConnectivityDialog = undefined;
    this.connectionStatusText = undefined;
    this.connectBtn = undefined;
    this.unsubscribeStatus?.();
    this.unsubscribeStatus = null;
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

    this.add.text(104, 310, "音乐(暂无)", bodyStyle("#f6f1e6", 18));
    this.createVolumeSlider(104, 344, 276, uiSettings.music, setMusicVolume);

    this.add.text(104, 386, "音效(暂无)", bodyStyle("#f6f1e6", 18));
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
    this.createPublicServerButton(774, 173);
    this.add.text(492, 356, "默认监听本地专用服务器", bodyStyle("#b7c7d8", 17));
    this.add.text(492, 396, "默认端口：22334", bodyStyle("#b7c7d8", 17));

    this.connectionStatusText = this.add.text(492, 436, " ", bodyStyle("#ffcf6e", 17));

    // Connect/disconnect button
    this.connectBtn = createFightButton(this, 613, 510, 250, 50, " ", () => this.onToggleConnection(), {
      accent: 0x34d399,
    });
    createFightButton(this, 613, 566, 250, 44, "测试连通性", () => this.showConnectivityDialog(), {
      accent: 0x5c7185,
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
      this.publicServerDialog = undefined;
      this.publicServerConnectivityDialog = undefined;
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
    if (!this.connectionStatusText?.active || !this.connectionStatusText.scene) {
      return;
    }
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

  private showConnectivityDialog(): void {
    if (this.publicServerConnectivityDialog) {
      this.publicServerConnectivityDialog.destroy();
      this.publicServerConnectivityDialog = undefined;
      return;
    }

    this.activeField?.blur();
    this.activeField = undefined;
    this.closePublicServerDialog();
    this.publicServerConnectivityDialog = showPublicServerConnectivityDialog(this, {
      onClose: () => {
        this.publicServerConnectivityDialog = undefined;
      },
    });
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
      maxLength: key === "serverAddress" ? 160 : MAX_PLAYER_NAME_LENGTH,
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
    if (key === "serverAddress") {
      this.serverAddressField = field;
    }
  }

  private createPublicServerButton(x: number, y: number): void {
    let hovering = false;
    const width = 36;
    const height = 32;
    const container = this.add.container(x, y);
    const background = this.add.graphics();
    const icon = this.add.graphics();
    const hitArea = this.add.rectangle(0, 0, width, height, 0xffffff, 0.001)
      .setOrigin(0, 0)
      .setInteractive({ useHandCursor: true });

    const draw = () => {
      background.clear();
      drawAngledPanel(background, 0, 0, width, height, hovering ? 0x252e3d : 0x151b26, hovering ? 0xffcf6e : 0x5c7185, 1);
      icon.clear();
      icon.fillStyle(hovering ? 0xffcf6e : 0xf6f1e6, 1);
      icon.fillTriangle(width / 2 - 7, 12, width / 2 + 7, 12, width / 2, 21);
    };

    hitArea.on("pointerover", () => {
      hovering = true;
      draw();
    });
    hitArea.on("pointerout", () => {
      hovering = false;
      draw();
    });
    hitArea.on("pointerup", () => {
      this.showPublicServerDialog();
    });

    container.add([background, icon, hitArea]);
    draw();
  }

  private showPublicServerDialog(): void {
    if (this.publicServerDialog) {
      this.publicServerDialog.destroy();
      this.publicServerDialog = undefined;
      return;
    }

    this.activeField?.blur();
    this.activeField = undefined;

    const seenAddresses = new Set<string>();
    const servers = PUBLIC_SERVER
      .map((server) => ({
        name: server.name.trim(),
        addr: server.addr.trim(),
      }))
      .filter((server) => {
        if (!server.addr || seenAddresses.has(server.addr)) {
          return false;
        }
        seenAddresses.add(server.addr);
        return true;
      });
    const rowHeight = 58;
    const dialogWidth = 560;
    const dialogHeight = 124 + Math.max(1, servers.length) * rowHeight;
    const x = 360;
    const y = Math.max(116, Math.round((720 - dialogHeight) / 2));
    const layer = this.add.container(0, 0).setDepth(1000);
    const shade = this.add.rectangle(0, 0, 1280, 720, 0x05070a, 0.62)
      .setOrigin(0, 0)
      .setInteractive({ useHandCursor: false });
    const panel = this.add.graphics();
    drawAngledPanel(panel, x, y, dialogWidth, dialogHeight, 0x101820, 0xffcf6e, 0.98);

    const title = this.add.text(x + 30, y + 24, "选择公共服务器", bodyStyle("#ffcf6e", 22));
    const closeBtn = this.createDialogCloseButton(x + dialogWidth - 62, y + 22, () => {
      this.closePublicServerDialog();
    });
    layer.add([shade, panel, title, closeBtn]);

    if (servers.length === 0) {
      layer.add(this.add.text(x + 30, y + 84, "暂无默认公共服务器", bodyStyle("#b7c7d8", 18)));
    } else {
      servers.forEach((server, index) => {
        layer.add(this.createServerOptionRow(x + 28, y + 76 + index * rowHeight, dialogWidth - 56, rowHeight - 8, server, index));
      });
    }

    shade.on("pointerup", () => {
      this.closePublicServerDialog();
    });
    this.publicServerDialog = layer;
  }

  private createDialogCloseButton(x: number, y: number, onClick: () => void): Phaser.GameObjects.Container {
    let hovering = false;
    const width = 34;
    const height = 30;
    const container = this.add.container(x, y);
    const background = this.add.graphics();
    const label = this.add.text(width / 2, height / 2 - 1, "×", bodyStyle("#f6f1e6", 23)).setOrigin(0.5);
    const hitArea = this.add.rectangle(0, 0, width, height, 0xffffff, 0.001)
      .setOrigin(0, 0)
      .setInteractive({ useHandCursor: true });

    const draw = () => {
      background.clear();
      drawAngledPanel(background, 0, 0, width, height, hovering ? 0x342335 : 0x151b26, hovering ? 0xff5c66 : 0x5c7185, 1);
      label.setColor(hovering ? "#ffffff" : "#f6f1e6");
    };
    hitArea.on("pointerover", () => {
      hovering = true;
      draw();
    });
    hitArea.on("pointerout", () => {
      hovering = false;
      draw();
    });
    hitArea.on("pointerup", (_pointer: Phaser.Input.Pointer, _localX: number, _localY: number, event: Phaser.Types.Input.EventData) => {
      event.stopPropagation();
      onClick();
    });
    container.add([background, label, hitArea]);
    draw();
    return container;
  }

  private createServerOptionRow(
    x: number,
    y: number,
    width: number,
    height: number,
    server: typeof PUBLIC_SERVER[number],
    index: number,
  ): Phaser.GameObjects.Container {
    let hovering = false;
    const selected = server.addr === uiSettings.serverAddress;
    const container = this.add.container(x, y);
    const background = this.add.graphics();
    const label = this.add.text(18, 8, server.name || `公共服务器 ${index + 1}`, bodyStyle(selected ? "#ffcf6e" : "#f6f1e6", 17));
    const address = this.add.text(18, 31, server.addr, bodyStyle("#b7c7d8", 14)).setWordWrapWidth(width - 36);
    const hitArea = this.add.rectangle(0, 0, width, height, 0xffffff, 0.001)
      .setOrigin(0, 0)
      .setInteractive({ useHandCursor: true });

    const draw = () => {
      background.clear();
      const fill = selected ? 0x263244 : hovering ? 0x18212d : 0x0f141d;
      const stroke = selected ? 0xffcf6e : hovering ? 0x9fd8ff : 0x34475c;
      drawAngledPanel(background, 0, 0, width, height, fill, stroke, 1);
      label.setColor(selected || hovering ? "#ffcf6e" : "#f6f1e6");
      address.setColor(hovering ? "#d7e3ef" : "#b7c7d8");
    };

    hitArea.on("pointerover", () => {
      hovering = true;
      draw();
    });
    hitArea.on("pointerout", () => {
      hovering = false;
      draw();
    });
    hitArea.on("pointerup", (_pointer: Phaser.Input.Pointer, _localX: number, _localY: number, event: Phaser.Types.Input.EventData) => {
      event.stopPropagation();
      this.serverAddressField?.setValue(server.addr);
      if (!this.serverAddressField) {
        setServerAddress(server.addr);
      }
      this.closePublicServerDialog();
    });

    container.add([background, label, address, hitArea]);
    draw();
    return container;
  }

  private closePublicServerDialog(): void {
    this.publicServerDialog?.destroy();
    this.publicServerDialog = undefined;
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
