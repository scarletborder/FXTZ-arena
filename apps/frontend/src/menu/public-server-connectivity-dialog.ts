import Phaser from "phaser";
import { IS_DESKTOP_APP, PUBLIC_SERVER, type PublicServer } from "@repo/constants";
import { t } from "@repo/i18n";

import { findServerCertificateFingerprint } from "../network/fingerprint";
import { isWebTransportAddress, normalizeServerAddress } from "../network/address";
import { WsNetworkTransport, WtDesktopTransport, WtNetworkTransport } from "../network/transport";
import type { BaseNetworkTransport } from "../network/transport";
import { bodyStyle, createFightButton, drawAngledPanel } from "./ui";

const GAME_WIDTH = 1280;
const GAME_HEIGHT = 720;
const PROBE_TIMEOUT_MS = 6_000;

interface PublicServerConnectivityDialogOptions {
  readonly onClose?: () => void;
}

interface PublicServerProbe {
  readonly name: string;
  readonly addr: string;
  readonly selfAuth: boolean;
  readonly trustUrl: string;
}

interface ProbeResult {
  readonly kind: "ok" | "trust_required" | "error";
  readonly latencyMs?: number;
}

interface ServerRowControl {
  setTesting(): void;
  setResult(result: ProbeResult): void;
}

export function showPublicServerConnectivityDialog(
  scene: Phaser.Scene,
  options: PublicServerConnectivityDialogOptions = {},
): Phaser.GameObjects.Container {
  const servers = collectPublicServers();
  const rowHeight = 66;
  const dialogWidth = 740;
  const dialogHeight = 142 + Math.max(1, servers.length) * rowHeight;
  const x = Math.round((GAME_WIDTH - dialogWidth) / 2);
  const y = Math.max(82, Math.round((GAME_HEIGHT - dialogHeight) / 2));
  const layer = scene.add.container(0, 0).setDepth(1000);
  const rows: ServerRowControl[] = [];
  let disposers: (() => void)[] = [];
  let destroyed = false;
  let startProbes = () => undefined;

  const shade = scene.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x05070a, 0.68)
    .setOrigin(0, 0)
    .setInteractive({ useHandCursor: false });
  const panel = scene.add.graphics();
  drawAngledPanel(panel, x, y, dialogWidth, dialogHeight, 0x101820, 0xffcf6e, 0.98);

  const title = scene.add.text(x + 32, y + 24, t("settings.online.public_server"), bodyStyle("#ffcf6e", 22));
  const hint = scene.add.text(
    x + 32,
    y + 62,
    t("public_server.hint"),
    bodyStyle("#d7e3ef", 16),
  ).setWordWrapWidth(dialogWidth - 220);
  const retestButton = createFightButton(scene, x + dialogWidth - 152, y + 40, 128, 36, t("public_server.retest"), () => startProbes(), { accent: 0x34d399 });
  const closeBtn = createDialogCloseButton(scene, x + dialogWidth - 64, y + 22, () => {
    layer.destroy();
  });

  layer.add([shade, panel, title, hint, retestButton.container, closeBtn]);

  if (servers.length === 0) {
    layer.add(scene.add.text(x + 32, y + 112, t("public_server.none"), bodyStyle("#b7c7d8", 18)));
  } else {
    servers.forEach((server, index) => {
      const row = createServerRow(scene, x + 30, y + 118 + index * rowHeight, dialogWidth - 60, rowHeight - 10, server, index);
      rows.push(row.control);
      layer.add(row.container);
    });
  }

  startProbes = () => {
    disposers.forEach((dispose) => dispose());
    disposers = [];
    rows.forEach((row) => row.setTesting());
    servers.forEach((server, index) => {
      const dispose = probeServer(server, (result) => {
        if (!destroyed) {
          rows[index]?.setResult(result);
        }
      });
      disposers.push(dispose);
    });
  };

  layer.once("destroy", () => {
    destroyed = true;
    disposers.forEach((dispose) => dispose());
    disposers = [];
    options.onClose?.();
  });
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
    layer.destroy();
  });

  startProbes();
  return layer;
}

function createDialogCloseButton(
  scene: Phaser.Scene,
  x: number,
  y: number,
  onClick: () => void,
): Phaser.GameObjects.Container {
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

function createServerRow(
  scene: Phaser.Scene,
  x: number,
  y: number,
  width: number,
  height: number,
  server: PublicServerProbe,
  index: number,
): { container: Phaser.GameObjects.Container; control: ServerRowControl } {
  const buttonWidth = 116;
  const container = scene.add.container(x, y);
  const background = scene.add.graphics();
  drawAngledPanel(background, 0, 0, width, height, 0x0f141d, 0x34475c, 1);
  const name = scene.add.text(18, 8, server.name || t("dialog.public_server_index", { index: index + 1 }), bodyStyle("#f6f1e6", 17));
  const address = scene.add.text(18, 33, server.addr, bodyStyle("#b7c7d8", 13)).setWordWrapWidth(width - buttonWidth - 180);
  const status = scene.add.text(width - buttonWidth - 156, 19, "", bodyStyle("#f7b733", 15)).setWordWrapWidth(142);
  const trustButton = createFightButton(
    scene,
    width - buttonWidth / 2 - 14,
    height / 2,
    buttonWidth,
    34,
    t("public_server.trust"),
    () => window.open(server.trustUrl, "_blank", "noopener,noreferrer"),
    { accent: 0x34d399 },
  );

  const setTrustButtonVisible = (visible: boolean) => {
    trustButton.container.setVisible(visible);
    trustButton.setEnabled(visible);
  };

  const control: ServerRowControl = {
    setTesting(): void {
      status.setText(t("public_server.testing"));
      status.setColor("#f7b733");
      setTrustButtonVisible(false);
    },
    setResult(result: ProbeResult): void {
      if (result.kind === "ok") {
        const prefix = server.selfAuth ? t("public_server.trusted") : t("public_server.latency");
        const latency = result.latencyMs ?? 0;
        status.setText(server.selfAuth ? `${prefix} ${latency} ms` : `${prefix} ${latency} ms`);
        status.setColor("#34d399");
        setTrustButtonVisible(false);
        return;
      }

      if (result.kind === "trust_required") {
        status.setText(t("public_server.trust_required"));
        status.setColor("#ffcf6e");
        setTrustButtonVisible(true);
        return;
      }

      status.setText(t("public_server.failed"));
      status.setColor("#ff5c66");
      setTrustButtonVisible(false);
    },
  };

  container.add([background, name, address, status, trustButton.container]);
  control.setTesting();
  return { container, control };
}

function probeServer(server: PublicServerProbe, onResult: (result: ProbeResult) => void): () => void {
  const startedAt = performance.now();
  let settled = false;
  let transport: BaseNetworkTransport | null = null;
  let timeout: ReturnType<typeof setTimeout> | null = null;

  const finish = (result: ProbeResult) => {
    if (settled) {
      return;
    }
    settled = true;
    if (timeout !== null) {
      clearTimeout(timeout);
      timeout = null;
    }
    transport?.close();
    onResult(result);
  };

  try {
    const address = normalizeServerAddress(server.addr);
    transport = isWebTransportAddress(address)
      ? IS_DESKTOP_APP
        ? new WtDesktopTransport(address, {
          open: () => {
            finish({ kind: "ok", latencyMs: Math.max(1, Math.round(performance.now() - startedAt)) });
          },
          close: () => {
            finish({ kind: server.selfAuth ? "trust_required" : "error" });
          },
          error: () => {
            finish({ kind: server.selfAuth ? "trust_required" : "error" });
          },
          message: () => undefined,
        })
        : new WtNetworkTransport(
          address,
          {
            open: () => {
              finish({ kind: "ok", latencyMs: Math.max(1, Math.round(performance.now() - startedAt)) });
            },
            close: () => {
              finish({ kind: server.selfAuth ? "trust_required" : "error" });
            },
            error: () => {
              finish({ kind: server.selfAuth ? "trust_required" : "error" });
            },
            message: () => undefined,
          },
          findServerCertificateFingerprint(address),
        )
      : new WsNetworkTransport(address, {
        open: () => {
          finish({ kind: "ok", latencyMs: Math.max(1, Math.round(performance.now() - startedAt)) });
        },
        close: () => {
          finish({ kind: server.selfAuth ? "trust_required" : "error" });
        },
        error: () => {
          finish({ kind: server.selfAuth ? "trust_required" : "error" });
        },
        message: () => undefined,
      });

    timeout = setTimeout(() => {
      finish({ kind: server.selfAuth ? "trust_required" : "error" });
    }, PROBE_TIMEOUT_MS);
    transport.open();
  } catch {
    finish({ kind: server.selfAuth ? "trust_required" : "error" });
  }

  return () => {
    if (settled) {
      return;
    }
    settled = true;
    if (timeout !== null) {
      clearTimeout(timeout);
      timeout = null;
    }
    transport?.close();
  };
}

function collectPublicServers(servers: readonly PublicServer[] = PUBLIC_SERVER): PublicServerProbe[] {
  const seen = new Set<string>();
  return servers
    .map((server) => ({
      name: server.name.trim(),
      addr: server.addr.trim(),
      selfAuth: Boolean(server.selfAuth),
      trustUrl: toTrustUrl(server.addr.trim()),
    }))
    .filter((server) => {
      if (!server.addr || seen.has(server.addr)) {
        return false;
      }
      seen.add(server.addr);
      return true;
    });
}

function toTrustUrl(addr: string): string {
  if (!addr) {
    return "";
  }
  try {
    const url = new URL(addr);
    if (url.protocol === "wss:") {
      url.protocol = "https:";
    } else if (url.protocol === "ws:") {
      url.protocol = "http:";
    }
    url.pathname = "/echo";
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    if (/^wss:\/\//i.test(addr)) {
      return `${addr.replace(/^wss:\/\//i, "https://").replace(/\/[^/?#]*(?:[?#].*)?$/, "")}/echo`;
    }
    if (/^ws:\/\//i.test(addr)) {
      return `${addr.replace(/^ws:\/\//i, "http://").replace(/\/[^/?#]*(?:[?#].*)?$/, "")}/echo`;
    }
    return addr;
  }
}
