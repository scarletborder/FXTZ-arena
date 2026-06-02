import Phaser from "phaser";
import { IS_DESKTOP_APP } from "@repo/constants";
import { t } from "@repo/i18n";

import { listenUdp, sendUdp, stopUdp, subscribeUdp } from "../network/desktop-udp";
import { installMenuAudioUnlock, type SceneKey, type TextFieldControl } from "./shared";
import { createBackButton, createFightButton, createTextField, drawAngledPanel, drawFightingBackdrop, drawPanel } from "./ui";

export class UdpConnectScene extends Phaser.Scene {
  private activeField: TextFieldControl | null = null;
  private listenPort = "10800";
  private guestAddress = "";
  private waitDialog: Phaser.GameObjects.Container | null = null;
  private unlistenUdp: (() => void) | null = null;

  private readonly onKeyDown = (event: KeyboardEvent) => this.activeField?.handleKey(event);
  private readonly onPaste = (event: ClipboardEvent) => this.activeField?.handlePaste(event.clipboardData?.getData("text") ?? "");

  constructor() {
    super("udp-connect" satisfies SceneKey);
  }

  create(): void {
    installMenuAudioUnlock(this);
    drawFightingBackdrop(this, "UDP", "DIRECT LINK");
    createBackButton(this, "battle-start");
    this.add.text(90, 74, t("udp_connect.title"), {
      fontFamily: "Arial, 'Microsoft YaHei', sans-serif",
      fontSize: "42px",
      fontStyle: "900",
      color: "#f6f1e6",
    });

    drawPanel(this, 156, 150, 968, 208, t("udp_connect.as_host"));
    this.add.text(198, 220, t("udp_connect.port"), {
      fontFamily: "Arial, 'Microsoft YaHei', sans-serif",
      fontSize: "18px",
      color: "#f6f1e6",
    });
    const portField = createTextField(this, 198, 258, 220, {
      value: this.listenPort,
      maxLength: 5,
      onFocus: (field) => { this.activeField = field; },
      onChange: (value) => { this.listenPort = value.replace(/\D/g, "").slice(0, 5); },
    });
    this.add.existing(portField.container);
    createFightButton(this, 840, 284, 220, 52, t("udp_connect.start_listen"), () => void this.startListening(), { accent: 0x34d399 });

    const divider = this.add.graphics();
    divider.lineStyle(2, 0x34475c, 0.9);
    divider.lineBetween(188, 390, 1092, 390);

    drawPanel(this, 156, 418, 968, 208, t("udp_connect.as_guest"));
    this.add.text(198, 488, t("udp_connect.address"), {
      fontFamily: "Arial, 'Microsoft YaHei', sans-serif",
      fontSize: "18px",
      color: "#f6f1e6",
    });
    const addressField = createTextField(this, 198, 526, 360, {
      value: this.guestAddress,
      maxLength: 64,
      onFocus: (field) => { this.activeField = field; },
      onChange: (value) => { this.guestAddress = value.trim(); },
    });
    this.add.existing(addressField.container);
    this.add.text(198, 590, t("udp_connect.address_tip"), {
      fontFamily: "Arial, 'Microsoft YaHei', sans-serif",
      fontSize: "15px",
      color: "#9fb4c8",
    });
    createFightButton(this, 840, 552, 220, 52, t("udp_connect.connect"), () => void this.connectGuest(), { accent: 0x34d399 });

    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("paste", this.onPaste);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      window.removeEventListener("keydown", this.onKeyDown);
      window.removeEventListener("paste", this.onPaste);
      this.unlistenUdp?.();
      this.unlistenUdp = null;
      void stopUdp().catch(() => undefined);
    });
  }

  private async startListening(): Promise<void> {
    if (!IS_DESKTOP_APP) return;
    const port = Number.parseInt(this.listenPort, 10) || 10800;
    try {
      await listenUdp(port);
      this.unlistenUdp?.();
      this.unlistenUdp = await subscribeUdp((packet) => {
        this.showToast(t("udp_connect.received_from", { addr: packet.addr }));
      });
      this.showWaitingDialog();
    } catch (error) {
      this.showToast(error instanceof Error ? error.message : String(error));
    }
  }

  private async connectGuest(): Promise<void> {
    if (!IS_DESKTOP_APP) return;
    if (!this.guestAddress.includes(":")) {
      this.showToast(t("udp_connect.address_required"));
      return;
    }
    try {
      await listenUdp(0);
      await sendUdp(this.guestAddress, new TextEncoder().encode("fxtz-udp-hello"));
      this.showToast(t("udp_connect.connect_sent"));
    } catch (error) {
      this.showToast(error instanceof Error ? error.message : String(error));
    }
  }

  private showWaitingDialog(): void {
    this.waitDialog?.destroy();
    const c = this.add.container(0, 0);
    this.waitDialog = c;
    c.add(this.add.rectangle(640, 360, 1280, 720, 0x000000, 0.62).setInteractive());
    const bg = this.add.graphics();
    drawAngledPanel(bg, 430, 250, 420, 220, 0x111821, 0x34d399, 0.98);
    c.add(bg);
    c.add(this.add.text(640, 320, t("udp_connect.waiting"), {
      fontFamily: "Arial, 'Microsoft YaHei', sans-serif",
      fontSize: "26px",
      fontStyle: "700",
      color: "#f6f1e6",
    }).setOrigin(0.5));
    c.add(createFightButton(this, 640, 410, 160, 46, t("udp_connect.stop"), () => {
      void stopUdp().catch(() => undefined);
      this.unlistenUdp?.();
      this.unlistenUdp = null;
      this.waitDialog?.destroy();
      this.waitDialog = null;
    }, { accent: 0xff5c66 }).container);
  }

  private showToast(message: string): void {
    const toast = this.add.text(640, 672, message, {
      fontFamily: "Arial, 'Microsoft YaHei', sans-serif",
      fontSize: "16px",
      color: "#ffcf6e",
      backgroundColor: "#111821ee",
      padding: { x: 16, y: 8 },
    }).setOrigin(0.5).setAlpha(0);
    this.tweens.add({ targets: toast, alpha: 1, duration: 180, yoyo: true, hold: 1600, onComplete: () => toast.destroy() });
  }
}
