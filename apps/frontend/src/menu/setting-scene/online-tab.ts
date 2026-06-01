import Phaser from "phaser";
import { PUBLIC_SERVER } from "@repo/constants";
import { t } from "@repo/i18n";

import {
  bodyStyle,
  createCheckbox,
  createFightButton,
  createRectangleButton,
  createTextField,
  drawAngledPanel,
} from "../ui";
import { connectionManager, type TextFieldControl } from "../shared";
import type { ConnectionStatus } from "../../network";
import {
  setServerAddress,
  setP2pEnabled,
  setStunServer,
  setStunServers,
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
      maxLength: 160,
      onFocus: activateField,
      onChange: (value) => {
        setServerAddress(value);
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

  const statusText = scene.add.text(36, 350, " ", bodyStyle("#ffcf6e", 17));
  const probeStatusText = scene.add.text(222, 278, t("settings.online.probe_idle"), bodyStyle("#b7c7d8", 16)).setWordWrapWidth(260);
  const trustButton = createFightButton(
    scene,
    526,
    288,
    142,
    40,
    t("settings.online.trust"),
    () => {
      if (latestTrustUrl) {
        window.open(latestTrustUrl, "_blank", "noopener,noreferrer");
      }
    },
    { accent: 0x34d399, enabled: false },
  );

  const connectButton = createFightButton(scene, 393, 360, 160, 42, " ", () => {
    if (connectionManager.status === "connected") {
      connectionManager.disconnect();
    } else {
      connectionManager.connect(uiSettings.serverAddress, uiSettings.username);
    }
  }, { accent: 0x34d399 });

  const updateConnectionDisplay = (status: ConnectionStatus) => {
    const statusMap: Record<ConnectionStatus, { text: string; color: string }> = {
      disconnected: { text: t("settings.online.connection_status.disconnected"), color: "#b7c7d8" },
      connecting: { text: t("settings.online.connection_status.connecting"), color: "#f7b733" },
      connected: { text: `${t("settings.online.connection_status.connected")} ${connectionManager.serverVersion ? `(${connectionManager.serverVersion})` : ""}`, color: "#34d399" },
      error: { text: t("settings.online.connection_status.error"), color: "#ff5c66" },
    };
    const info = statusMap[status] ?? statusMap.disconnected;
    if (!statusText.active || !statusText.scene) {
      return;
    }
    statusText.setText(info.text).setColor(info.color);
    connectButton.setLabel(status === "connected" ? t("settings.online.disconnect") : t("settings.online.connect"));
  };

  const setTrustButtonVisible = (visible: boolean) => {
    trustButton.container.setVisible(visible);
    trustButton.setEnabled(visible);
  };

  const setProbeResult = (result: ProbeResult, trustUrl: string) => {
    latestTrustUrl = trustUrl;
    if (result.kind === "ok") {
      probeStatusText.setText(t("settings.online.probe_ok", { ms: result.latencyMs ?? 0 })).setColor("#34d399");
      setTrustButtonVisible(false);
      return;
    }
    if (result.kind === "trust_required") {
      probeStatusText.setText(t("settings.online.probe_trust_required")).setColor("#ffcf6e");
      setTrustButtonVisible(true);
      return;
    }
    probeStatusText.setText(t("settings.online.probe_failed")).setColor("#ff5c66");
    setTrustButtonVisible(false);
  };

  const testCurrentServer = () => {
    pendingProbeDispose?.();
    pendingProbeDispose = undefined;
    latestTrustUrl = "";
    setTrustButtonVisible(false);
    probeStatusText.setText(t("settings.online.probe_testing")).setColor("#f7b733");
    pendingProbeDispose = probeCustomServer(uiSettings.serverAddress, (result, trustUrl) => {
      pendingProbeDispose = undefined;
      setProbeResult(result, trustUrl);
    });
  };

  const currentServerButton = createFightButton(scene, 124, 288, 154, 40, t("settings.online.test_current"), testCurrentServer, { accent: 0x5c7185 });
  const publicServerLabel = scene.add.text(36, 230, t("settings.online.public_servers"), bodyStyle("#f6f1e6", 18));
  const publicServerButton = createRectangleButton(scene, 166, 240, 42, 36, "▼", openPublicServerDialog, { accent: 0x5c7185 });
  const publicProbeButton = createFightButton(scene, 398, 250, 168, 40, t("settings.online.test_public"), openConnectivityDialog, { accent: 0x5c7185 });

  layer.add(sectionTitle(scene, 36, 34, t("settings.online.dedicated_server")));
  layer.add(scene.add.text(36, 86, t("settings.online.server_address.title"), bodyStyle("#f6f1e6", 18)));
  serverAddressField = createField(36, 124, 500, "serverAddress");
  layer.add(scene.add.text(36, 188, `${t("settings.online.server_address.helper")}，${t("settings.online.server_address.port")}`, bodyStyle("#b7c7d8", 16)));
  layer.add(publicServerLabel);
  layer.add(publicServerButton.container);
  layer.add(publicProbeButton.container);
  layer.add(probeStatusText);
  layer.add(currentServerButton.container);
  layer.add(trustButton.container);
  layer.add(statusText);
  layer.add(connectButton.container);

  renderP2pSection(scene, layer, 616, 34);

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

function renderP2pSection(scene: SettingsScene, layer: Phaser.GameObjects.Container, x: number, y: number): void {
  let stunDialog: Phaser.GameObjects.Container | undefined;
  const p2pText = scene.add.text(x, y + 52, t("settings.online.p2p_enabled"), bodyStyle("#d7e3ef", 18));
  const p2pCheckbox = createCheckbox(scene, x + 100, y + 62, uiSettings.p2pEnabled, {
    onChange: (nextEnabled) => {
      setP2pEnabled(nextEnabled);
    },
  });
  const stunText = scene.add.text(x, y + 130, uiSettings.stunServer, bodyStyle("#9fd8ff", 16)).setWordWrapWidth(410);
  const closeStunDialog = () => {
    stunDialog?.destroy();
    stunDialog = undefined;
  };
  const openStunDialog = () => {
    if (stunDialog) {
      closeStunDialog();
      return;
    }
    stunDialog = createStunServerDialog(scene, stunText, () => {
      stunDialog = undefined;
    });
  };
  const addStun = () => {
    const raw = window.prompt(t("settings.online.add_stun"), uiSettings.stunServer);
    if (!raw) return;
    setStunServer(raw);
    setStunServers([uiSettings.stunServer, ...uiSettings.stunServers]);
    stunText.setText(uiSettings.stunServer);
  };

  layer.add(sectionTitle(scene, x, y, t("settings.online.p2p")));
  layer.add(p2pText);
  layer.add(p2pCheckbox.container);
  layer.add(scene.add.text(x, y + 92, t("settings.online.stun_server"), bodyStyle("#f6f1e6", 18)));
  layer.add(stunText);
  layer.add(createRectangleButton(scene, x + 430, y + 141, 42, 34, "▼", openStunDialog, { accent: 0x5c7185 }).container);
  layer.add(createRectangleButton(scene, x + 484, y + 141, 42, 34, "+", addStun, { accent: 0x34d399 }).container);
  layer.add(scene.add.text(x, y + 206, t("settings.online.p2p_hint"), bodyStyle("#b7c7d8", 16)).setWordWrapWidth(480));

  scene.addCleanup(closeStunDialog);
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

  const title = scene.add.text(x + 30, y + 24, t("settings.online.public_server"), bodyStyle("#ffcf6e", 22));
  const closeBtn = createDialogCloseButton(scene, x + dialogWidth - 62, y + 22, () => {
    layer.destroy();
  });
  layer.add([shade, panel, title, closeBtn]);

  if (servers.length === 0) {
    layer.add(scene.add.text(x + 30, y + 84, t("settings.online.no_public_server"), bodyStyle("#b7c7d8", 18)));
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

function createStunServerDialog(
  scene: SettingsScene,
  stunText: Phaser.GameObjects.Text,
  onClose: () => void,
): Phaser.GameObjects.Container {
  const servers = uiSettings.stunServers;
  const rowHeight = 52;
  const dialogWidth = 520;
  const dialogHeight = 112 + Math.max(1, servers.length) * rowHeight;
  const x = 390;
  const y = Math.max(116, Math.round((720 - dialogHeight) / 2));
  const layer = scene.add.container(0, 0).setDepth(1000);
  const shade = scene.add.rectangle(0, 0, 1280, 720, 0x05070a, 0.62)
    .setOrigin(0, 0)
    .setInteractive({ useHandCursor: false });
  const panel = scene.add.graphics();
  drawAngledPanel(panel, x, y, dialogWidth, dialogHeight, 0x101820, 0xffcf6e, 0.98);
  const title = scene.add.text(x + 30, y + 24, t("settings.online.select_stun"), bodyStyle("#ffcf6e", 22));
  const closeBtn = createDialogCloseButton(scene, x + dialogWidth - 62, y + 22, () => {
    layer.destroy();
  });
  layer.add([shade, panel, title, closeBtn]);

  servers.forEach((server, index) => {
    layer.add(createStunOptionRow(scene, x + 28, y + 74 + index * rowHeight, dialogWidth - 56, rowHeight - 8, server, stunText, () => {
      layer.destroy();
    }));
  });

  shade.on("pointerup", () => {
    layer.destroy();
  });
  layer.once("destroy", onClose);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
    layer.destroy();
  });
  return layer;
}

function createStunOptionRow(
  scene: Phaser.Scene,
  x: number,
  y: number,
  width: number,
  height: number,
  server: string,
  stunText: Phaser.GameObjects.Text,
  onPick: () => void,
): Phaser.GameObjects.Container {
  let hovering = false;
  const selected = server === uiSettings.stunServer;
  const container = scene.add.container(x, y);
  const background = scene.add.graphics();
  const label = scene.add.text(18, 12, server, bodyStyle(selected ? "#ffcf6e" : "#f6f1e6", 16)).setWordWrapWidth(width - 36);
  const hitArea = scene.add.rectangle(0, 0, width, height, 0xffffff, 0.001)
    .setOrigin(0, 0)
    .setInteractive({ useHandCursor: true });

  const draw = () => {
    background.clear();
    drawAngledPanel(background, 0, 0, width, height, selected ? 0x263244 : hovering ? 0x18212d : 0x0f141d, selected ? 0xffcf6e : hovering ? 0x9fd8ff : 0x34475c, 1);
    label.setColor(selected || hovering ? "#ffcf6e" : "#f6f1e6");
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
    setStunServer(server);
    stunText.setText(uiSettings.stunServer);
    onPick();
  });

  container.add([background, label, hitArea]);
  draw();
  return container;
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
  const label = scene.add.text(18, 8, server.name || t("dialog.public_server_index", { index: index + 1 }), bodyStyle(selected ? "#ffcf6e" : "#f6f1e6", 17));
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
