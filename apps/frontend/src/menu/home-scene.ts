import Phaser from "phaser";
import { PUBLIC_SERVER } from "@repo/constants";

import { bodyStyle, createFightButton, drawAngledPanel, drawBuildLabel, drawFightingBackdrop, drawTitleBlock } from "./ui";
import type { SelectionData, SceneKey } from "./shared";
import { setSelfAuthed, uiSettings } from "../store/settings";

export class HomeScene extends Phaser.Scene {
  private selfAuthDialog: Phaser.GameObjects.Container | undefined;

  constructor() {
    super("home" satisfies SceneKey);
  }

  create(): void {
    drawFightingBackdrop(this, "FXTZ ARENA", "LOCAL M5 BUILD");
    drawTitleBlock(this, "FXTZ ARENA", "肥乡天则 ~ 角斗少女的虚荣");

    const buttons = [
      { label: "开始战斗", onClick: () => this.scene.start("battle-start") },
      { label: "靶场", onClick: () => this.scene.start("select", { mode: "training" } satisfies SelectionData) },
      { label: "图鉴", onClick: () => this.scene.start("codex") },
      { label: "关于", onClick: () => window.open("https://blog.scarletborder.cn/2026/05/fxtz-arena.html", "_blank", "noopener,noreferrer") },
      { label: "设置", onClick: () => this.scene.start("settings") },
    ];

    buttons.forEach((button, index) => {
      createFightButton(this, 642, 286 + index * 78, 310, 58, button.label, button.onClick);
    });

    this.add.text(1254, 674, "本游戏使用AI绘图，AI编码", {
      ...bodyStyle("#9fb4c8", 14),
      align: "right",
    }).setOrigin(1, 1).setAlpha(0.82);
    drawBuildLabel(this);
    this.showSelfAuthDialogIfNeeded();
  }

  private showSelfAuthDialogIfNeeded(): void {
    if (uiSettings.selfAuthed) {
      return;
    }

    const servers = collectSelfAuthServers();
    if (servers.length === 0) {
      return;
    }

    const rowHeight = 58;
    const dialogWidth = 720;
    const dialogHeight = 166 + servers.length * rowHeight;
    const x = Math.round((1280 - dialogWidth) / 2);
    const y = Math.max(82, Math.round((720 - dialogHeight) / 2));
    const layer = this.add.container(0, 0).setDepth(1000);
    const shade = this.add.rectangle(0, 0, 1280, 720, 0x05070a, 0.68)
      .setOrigin(0, 0)
      .setInteractive({ useHandCursor: false });
    const panel = this.add.graphics();
    drawAngledPanel(panel, x, y, dialogWidth, dialogHeight, 0x101820, 0xffcf6e, 0.98);

    const title = this.add.text(x + 32, y + 24, "需要手动信任自建证书", bodyStyle("#ffcf6e", 22));
    const hint = this.add.text(
      x + 32,
      y + 62,
      "请逐一点击下方按钮，在新打开的页面中通过浏览器安全提示并信任证书。\n完成后回到游戏，关闭此窗口即可继续连接 WSS 服务。",
      bodyStyle("#d7e3ef", 16),
    ).setWordWrapWidth(dialogWidth - 98);
    const closeBtn = this.createSelfAuthCloseButton(x + dialogWidth - 64, y + 22);

    layer.add([shade, panel, title, hint, closeBtn]);
    servers.forEach((server, index) => {
      layer.add(this.createSelfAuthRow(x + 30, y + 126 + index * rowHeight, dialogWidth - 60, rowHeight - 8, server, index));
    });

    this.selfAuthDialog = layer;
  }

  private createSelfAuthCloseButton(x: number, y: number): Phaser.GameObjects.Container {
    let hovering = false;
    const width = 34;
    const height = 30;
    const container = this.add.container(x, y);
    const background = this.add.graphics();
    const label = this.add.text(width / 2, height / 2 - 1, "X", bodyStyle("#f6f1e6", 21)).setOrigin(0.5);
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
      setSelfAuthed(true);
      this.selfAuthDialog?.destroy();
      this.selfAuthDialog = undefined;
    });

    container.add([background, label, hitArea]);
    draw();
    return container;
  }

  private createSelfAuthRow(
    x: number,
    y: number,
    width: number,
    height: number,
    server: SelfAuthServer,
    index: number,
  ): Phaser.GameObjects.Container {
    const buttonWidth = 132;
    const container = this.add.container(x, y);
    const background = this.add.graphics();
    drawAngledPanel(background, 0, 0, width, height, 0x0f141d, 0x34475c, 1);
    const name = this.add.text(18, 8, server.name || `自建证书服务 ${index + 1}`, bodyStyle("#f6f1e6", 17));
    const address = this.add.text(18, 31, server.trustUrl, bodyStyle("#b7c7d8", 14)).setWordWrapWidth(width - buttonWidth - 50);
    const button = createFightButton(
      this,
      width - buttonWidth / 2 - 14,
      height / 2,
      buttonWidth,
      36,
      "前往信任",
      () => window.open(server.trustUrl, "_blank", "noopener,noreferrer"),
      { accent: 0x34d399 },
    );

    container.add([background, name, address, button.container]);
    return container;
  }
}

interface SelfAuthServer {
  readonly name: string;
  readonly trustUrl: string;
}

function collectSelfAuthServers(): SelfAuthServer[] {
  const seen = new Set<string>();
  return PUBLIC_SERVER
    .filter((server) => server.selfAuth)
    .map((server) => ({
      name: server.name.trim(),
      trustUrl: toTrustUrl(server.addr.trim()),
    }))
    .filter((server) => {
      if (!server.trustUrl || seen.has(server.trustUrl)) {
        return false;
      }
      seen.add(server.trustUrl);
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
