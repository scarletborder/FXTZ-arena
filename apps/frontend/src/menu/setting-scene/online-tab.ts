import Phaser from "phaser";
import { MAX_PLAYER_NAME_LENGTH, PUBLIC_SERVER } from "@repo/constants";

import {
  bodyStyle,
  createFightButton,
  createRectangleButton,
  createTextField,
  drawAngledPanel,
} from "../ui";
import { connectionManager, type TextFieldControl } from "../shared";
import type { ConnectionStatus } from "../../network";
import {
  setServerAddress,
  setUsername,
  uiSettings,
} from "../../store/settings";
import { showPublicServerConnectivityDialog } from "../public-server-connectivity-dialog";
import type { SettingsScene } from "./index";
import { probeCustomServer, type ProbeResult } from "./probe";

export function renderOnlineTab(scene: SettingsScene, layer: Phaser.GameObjects.Container): void {
  let activeField: TextFieldControl | undefined;
  let serverAddressField: TextFieldControl | undefined;
  let publicServerDialog: Phaser.GameObjects.Container | undefined;
  let connectivityDialog: Phaser.GameObjects.Container | undefined;
  let pendingProbeDispose: (() => void) | undefined;
  let latestTrustUrl = "";

  const activateField = (field: TextFieldControl) => {
    if (activeField === field) {
      return;
    }
    activeField?.setActive(false);
    activeField = field;
    field.setActive(true);
  };

  const onKeyDown = (event: KeyboardEvent) => {
    activeField?.handleKey(event);
  };
  const onPaste = (event: ClipboardEvent) => {
    if (!activeField) {
      return;
    }
    const text = event.clipboardData?.getData("text") ?? "";
    if (text.length === 0) {
      return;
    }
    activeField.handlePaste(text);
    event.preventDefault();
  };

  const createField = (
    x: number,
    y: number,
    width: number,
    key: "username" | "serverAddress",
  ): TextFieldControl => {
    const field = createTextField(scene, x, y, width, {
      value: uiSettings[key],
      maxLength: key === "serverAddress" ? 160 : MAX_PLAYER_NAME_LENGTH,
      onFocus: activateField,
      onChange: (value) => {
        if (key === "username") {
          setUsername(value);
        } else {
          setServerAddress(value);
        }
      },
    });
    field.hitArea.on("pointerdown", () => {
      activateField(field);
    });
    layer.add(field.container);
    return field;
  };

  const closePublicServerDialog = () => {
    publicServerDialog?.destroy();
    publicServerDialog = undefined;
  };

  const closeConnectivityDialog = () => {
    connectivityDialog?.destroy();
    connectivityDialog = undefined;
  };

  const openPublicServerDialog = () => {
    if (publicServerDialog) {
      closePublicServerDialog();
      return;
    }
    activeField?.blur();
    activeField = undefined;
    closeConnectivityDialog();
    publicServerDialog = createPublicServerDialog(scene, serverAddressField, () => {
      publicServerDialog = undefined;
    });
  };

  const openConnectivityDialog = () => {
    if (connectivityDialog) {
      closeConnectivityDialog();
      return;
    }
    activeField?.blur();
    activeField = undefined;
    closePublicServerDialog();
    connectivityDialog = showPublicServerConnectivityDialog(scene, {
      onClose: () => {
        connectivityDialog = undefined;
      },
    });
  };

  const statusText = scene.add.text(36, 286, " ", bodyStyle("#ffcf6e", 17));
  const probeStatusText = scene.add.text(802, 248, "尚未测试当前地址", bodyStyle("#b7c7d8", 17)).setWordWrapWidth(260);
  const trustButton = createFightButton(
    scene,
    1005,
    258,
    142,
    40,
    "去信任",
    () => {
      if (latestTrustUrl) {
        window.open(latestTrustUrl, "_blank", "noopener,noreferrer");
      }
    },
    { accent: 0x34d399, enabled: false },
  );

  const connectButton = createFightButton(scene, 166, 346, 250, 50, " ", () => {
    if (connectionManager.status === "connected") {
      connectionManager.disconnect();
    } else {
      connectionManager.connect(uiSettings.serverAddress, uiSettings.username);
    }
  }, { accent: 0x34d399 });

  const updateConnectionDisplay = (status: ConnectionStatus) => {
    const statusMap: Record<ConnectionStatus, { text: string; color: string }> = {
      disconnected: { text: "连接状态：未连接", color: "#b7c7d8" },
      connecting: { text: "连接状态：正在连接…", color: "#f7b733" },
      connected: { text: `连接状态：已连接 ${connectionManager.serverVersion ? `(${connectionManager.serverVersion})` : ""}`, color: "#34d399" },
      error: { text: "连接状态：连接失败", color: "#ff5c66" },
    };
    const info = statusMap[status] ?? statusMap.disconnected;
    if (!statusText.active || !statusText.scene) {
      return;
    }
    statusText.setText(info.text).setColor(info.color);
    connectButton.setLabel(status === "connected" ? "断开连接" : "连接服务器");
  };

  const setTrustButtonVisible = (visible: boolean) => {
    trustButton.container.setVisible(visible);
    trustButton.setEnabled(visible);
  };

  const setProbeResult = (result: ProbeResult, trustUrl: string) => {
    latestTrustUrl = trustUrl;
    if (result.kind === "ok") {
      probeStatusText.setText(`当前地址可连接，延迟 ${result.latencyMs ?? 0} ms`).setColor("#34d399");
      setTrustButtonVisible(false);
      return;
    }
    if (result.kind === "trust_required") {
      probeStatusText.setText("当前地址可能需要手动信任证书").setColor("#ffcf6e");
      setTrustButtonVisible(true);
      return;
    }
    probeStatusText.setText("当前地址连接失败").setColor("#ff5c66");
    setTrustButtonVisible(false);
  };

  const testCurrentServer = () => {
    pendingProbeDispose?.();
    pendingProbeDispose = undefined;
    latestTrustUrl = "";
    setTrustButtonVisible(false);
    probeStatusText.setText("正在测试当前地址…").setColor("#f7b733");
    pendingProbeDispose = probeCustomServer(uiSettings.serverAddress, (result, trustUrl) => {
      pendingProbeDispose = undefined;
      setProbeResult(result, trustUrl);
    });
  };

  const currentServerButton = createFightButton(scene, 704, 258, 154, 40, "测试当前地址", testCurrentServer, { accent: 0x5c7185 });
  const publicServerLabel = scene.add.text(616, 318, "公共服务器", bodyStyle("#f6f1e6", 18));
  const publicServerButton = createRectangleButton(scene, 746, 328, 42, 36, "▼", openPublicServerDialog, { accent: 0x5c7185 });
  const publicProbeButton = createFightButton(scene, 992, 338, 168, 40, "测试公共服", openConnectivityDialog, { accent: 0x5c7185 });

  layer.add(sectionTitle(scene, 36, 34, "账号"));
  layer.add(scene.add.text(36, 86, "用户名", bodyStyle("#f6f1e6", 18)));
  createField(36, 124, 360, "username");

  layer.add(sectionTitle(scene, 36, 230, "连接"));
  layer.add(statusText);
  layer.add(connectButton.container);

  layer.add(sectionTitle(scene, 616, 34, "服务器"));
  layer.add(scene.add.text(616, 86, "专用服务器地址", bodyStyle("#f6f1e6", 18)));
  serverAddressField = createField(616, 124, 460, "serverAddress");
  layer.add(scene.add.text(616, 188, "默认监听本地专用服务器，默认端口：22334", bodyStyle("#b7c7d8", 16)));
  layer.add(publicServerLabel);
  layer.add(publicServerButton.container);
  layer.add(publicProbeButton.container);
  layer.add(probeStatusText);
  layer.add(currentServerButton.container);
  layer.add(trustButton.container);

  setTrustButtonVisible(false);
  updateConnectionDisplay(connectionManager.status);
  const unsubscribeStatus = connectionManager.addStatusListener(updateConnectionDisplay);
  scene.input.keyboard?.on("keydown", onKeyDown);
  window.addEventListener("paste", onPaste);

  scene.addCleanup(() => {
    pendingProbeDispose?.();
    pendingProbeDispose = undefined;
    scene.input.keyboard?.off("keydown", onKeyDown);
    window.removeEventListener("paste", onPaste);
    activeField = undefined;
    closePublicServerDialog();
    closeConnectivityDialog();
    unsubscribeStatus();
  });
}

function sectionTitle(scene: Phaser.Scene, x: number, y: number, label: string): Phaser.GameObjects.Text {
  return scene.add.text(x, y, label, {
    ...bodyStyle("#ffcf6e", 20),
    fontStyle: "700",
  });
}

function createPublicServerDialog(
  scene: SettingsScene,
  serverAddressField: TextFieldControl | undefined,
  onClose: () => void,
): Phaser.GameObjects.Container {
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
  const layer = scene.add.container(0, 0).setDepth(1000);
  const shade = scene.add.rectangle(0, 0, 1280, 720, 0x05070a, 0.62)
    .setOrigin(0, 0)
    .setInteractive({ useHandCursor: false });
  const panel = scene.add.graphics();
  drawAngledPanel(panel, x, y, dialogWidth, dialogHeight, 0x101820, 0xffcf6e, 0.98);

  const title = scene.add.text(x + 30, y + 24, "选择公共服务器", bodyStyle("#ffcf6e", 22));
  const closeBtn = createDialogCloseButton(scene, x + dialogWidth - 62, y + 22, () => {
    layer.destroy();
  });
  layer.add([shade, panel, title, closeBtn]);

  if (servers.length === 0) {
    layer.add(scene.add.text(x + 30, y + 84, "暂无默认公共服务器", bodyStyle("#b7c7d8", 18)));
  } else {
    servers.forEach((server, index) => {
      layer.add(createServerOptionRow(scene, x + 28, y + 76 + index * rowHeight, dialogWidth - 56, rowHeight - 8, server, index, serverAddressField, () => {
        layer.destroy();
      }));
    });
  }

  shade.on("pointerup", () => {
    layer.destroy();
  });
  layer.once("destroy", onClose);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
    layer.destroy();
  });
  return layer;
}

function createDialogCloseButton(scene: Phaser.Scene, x: number, y: number, onClick: () => void): Phaser.GameObjects.Container {
  let hovering = false;
  const width = 34;
  const height = 30;
  const container = scene.add.container(x, y);
  const background = scene.add.graphics();
  const label = scene.add.text(width / 2, height / 2 - 1, "X", bodyStyle("#f6f1e6", 21)).setOrigin(0.5);
  const hitArea = scene.add.rectangle(0, 0, width, height, 0xffffff, 0.001)
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

function createServerOptionRow(
  scene: Phaser.Scene,
  x: number,
  y: number,
  width: number,
  height: number,
  server: { readonly name: string; readonly addr: string },
  index: number,
  serverAddressField: TextFieldControl | undefined,
  onPick: () => void,
): Phaser.GameObjects.Container {
  let hovering = false;
  const selected = server.addr === uiSettings.serverAddress;
  const container = scene.add.container(x, y);
  const background = scene.add.graphics();
  const label = scene.add.text(18, 8, server.name || `公共服务器 ${index + 1}`, bodyStyle(selected ? "#ffcf6e" : "#f6f1e6", 17));
  const address = scene.add.text(18, 31, server.addr, bodyStyle("#b7c7d8", 14)).setWordWrapWidth(width - 36);
  const hitArea = scene.add.rectangle(0, 0, width, height, 0xffffff, 0.001)
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
    serverAddressField?.setValue(server.addr);
    if (!serverAddressField) {
      setServerAddress(server.addr);
    }
    onPick();
  });

  container.add([background, label, address, hitArea]);
  draw();
  return container;
}
