import Phaser from "phaser";
import { IS_DESKTOP_APP, MAX_ROOM_NAME_LENGTH } from "@repo/constants";
import { getAvailableCombatMaps } from "@repo/content";
import { t } from "@repo/i18n";
import type { MapId, PlayerId } from "@repo/types";

import type { ConnectionStatus } from "../network";
import { uiSettings } from "../store/settings";
import { createMapDropdown, showMapDialog } from "./map-dialog";
import { connectionManager, installMenuAudioUnlock, type SceneKey, type SelectionData, type TextFieldControl } from "./shared";
import { createBackButton, createFightButton, createTextField, drawAngledPanel, drawFightingBackdrop, drawPanel } from "./ui";

export class BattleStartScene extends Phaser.Scene {
  private indicator!: Phaser.GameObjects.Graphics;
  private statusLabel!: Phaser.GameObjects.Text;
  private quickMatchBtn!: { setEnabled(enabled: boolean): void; container: Phaser.GameObjects.Container };
  private createRoomBtn!: { setEnabled(enabled: boolean): void; container: Phaser.GameObjects.Container };
  private roomListBtn!: { setEnabled(enabled: boolean): void; container: Phaser.GameObjects.Container };
  private formContainer: Phaser.GameObjects.Container | null = null;
  private mapDialogContainer: Phaser.GameObjects.Container | null = null;
  private activeField: TextFieldControl | null = null;
  private unsubscribeStatus: (() => void) | null = null;

  private readonly onKeyDown = (event: KeyboardEvent) => this.activeField?.handleKey(event);
  private readonly onPaste = (event: ClipboardEvent) => this.activeField?.handlePaste(event.clipboardData?.getData("text") ?? "");

  constructor() {
    super("battle-start" satisfies SceneKey);
  }

  create(): void {
    installMenuAudioUnlock(this);
    drawFightingBackdrop(this, "BATTLE", "VERSUS ENTRY");
    createBackButton(this);
    this.add.text(90, 74, t("battle_start.title"), { fontFamily: "Arial, 'Microsoft YaHei', sans-serif", fontSize: "42px", fontStyle: "900", color: "#f6f1e6" });

    this.indicator = this.add.graphics();
    this.statusLabel = this.add.text(90, 130, "", { fontFamily: "Arial, 'Microsoft YaHei', sans-serif", fontSize: "14px", color: "#b7c7d8" });
    this.drawIndicator("disconnected");

    drawPanel(this, 72, 176, 520, 432, t("battle_start.online"));
    drawPanel(this, 686, 176, 520, 432, t("battle_start.local"));
    this.quickMatchBtn = createFightButton(this, 332, 272, 330, 70, t("battle_start.quick_match"), () => this.onQuickMatch(), { enabled: false, subLabel: t("battle_start.match_public_room") });
    this.createRoomBtn = createFightButton(this, 332, 374, 330, 70, t("battle_start.create_room"), () => this.onCreateRoom(), { enabled: false, subLabel: t("battle_start.wait_opponent_after_create") });
    this.roomListBtn = createFightButton(this, 332, 462, 330, 62, t("battle_start.room_list"), () => this.scene.start("room-list"), { enabled: false, subLabel: t("battle_start.browse_rooms") });
    createFightButton(this, 332, 548, 330, 58, t("battle_start.udp_connect"), () => this.scene.start("udp-connect"), {
      enabled: IS_DESKTOP_APP,
      subLabel: IS_DESKTOP_APP ? t("battle_start.udp_connect_ready") : t("battle_start.use_desktop_client"),
      accent: 0x26c6da,
    });

    createFightButton(this, 946, 298, 360, 86, t("battle_start.ai_battle"), () => showMapDialog(this, this.mapDialogContainer, (container) => {
      this.mapDialogContainer = container;
    }, (mapId) => {
      this.scene.start("select", { mode: "ai", mapId } satisfies SelectionData);
    }), { subLabel: t("battle_start.choose_loadout"), accent: 0xe33d44 });
    createFightButton(this, 946, 416, 360, 86, t("battle_start.training"), () => this.scene.start("select", { mode: "training" } satisfies SelectionData), { subLabel: t("battle_start.no_cost_limit"), accent: 0x26c6da });
    createFightButton(this, 946, 534, 360, 86, t("battle_start.local_lan"), () => this.scene.start("local-lan"), { subLabel: t("battle_start.discover_lan_players"), accent: 0xffcf6e });

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
    console.log("[FXTZ] Connecting to server", {
      address: uiSettings.serverAddress,
      username: uiSettings.username,
    });
    connectionManager.connect(uiSettings.serverAddress, uiSettings.username);

    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("paste", this.onPaste);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      connectionManager.setMessageHandler(null);
      this.unsubscribeStatus?.();
      this.unsubscribeStatus = null;
      this.mapDialogContainer?.destroy();
      this.mapDialogContainer = null;
      window.removeEventListener("keydown", this.onKeyDown);
      window.removeEventListener("paste", this.onPaste);
    });
  }

  private drawIndicator(status: ConnectionStatus): void {
    this.indicator.clear();
    const color = status === "connected" ? 0x34d399 : status === "connecting" ? 0xf7b733 : 0xff5c66;
    this.indicator.fillStyle(color, 1);
    this.indicator.fillCircle(96, 142, 5);
    this.statusLabel.setText(status === "connected" ? `${t("battle_start.connected")}${connectionManager.serverVersion ? ` (${connectionManager.serverVersion})` : ""}` : status === "connecting" ? t("battle_start.connecting") : status === "error" ? t("battle_start.error") : t("battle_start.disconnected"));
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
    this.showToast(t("battle_start.matching"));
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
    const ph = 420;
    const px = cx - pw / 2;
    const py = cy - ph / 2;
    const bg = this.add.graphics();
    drawAngledPanel(bg, px, py, pw, ph, 0x111821, 0x5c7185, 0.98);
    c.add(bg);
    c.add(this.add.text(cx, py + 28, t("battle_start.create_room"), { fontFamily: "Arial, 'Microsoft YaHei', sans-serif", fontSize: "22px", fontStyle: "700", color: "#ffcf6e" }).setOrigin(0.5));
    let roomName = Array.from(t("battle_start.default_room_name", { name: uiSettings.username })).slice(0, MAX_ROOM_NAME_LENGTH).join("");
    let roomPassword = "";
    let selectedMapId: MapId = "hakurei_shrine";
    c.add(this.add.text(cx - 140, py + 78, t("battle_start.room_name"), { fontFamily: "Arial, 'Microsoft YaHei', sans-serif", fontSize: "16px", color: "#f6f1e6" }));
    const nameField = createTextField(this, cx - 140, py + 108, 280, {
      value: roomName,
      maxLength: MAX_ROOM_NAME_LENGTH,
      onFocus: (field) => { this.activeField = field; },
      onChange: (v) => { roomName = v; },
    });
    c.add(nameField.container);
    this.activeField = nameField;
    c.add(this.add.text(cx - 140, py + 158, t("battle_start.room_password"), { fontFamily: "Arial, 'Microsoft YaHei', sans-serif", fontSize: "16px", color: "#f6f1e6" }));
    const passwordField = createTextField(this, cx - 140, py + 188, 280, {
      value: roomPassword,
      onFocus: (field) => { this.activeField = field; },
      onChange: (v) => { roomPassword = v; },
    });
    c.add(passwordField.container);
    const maps = getAvailableCombatMaps();
    c.add(this.add.text(cx - 140, py + 238, t("battle_start.map"), { fontFamily: "Arial, 'Microsoft YaHei', sans-serif", fontSize: "16px", color: "#f6f1e6" }));
    const mapDropdown = createMapDropdown(this, cx - 140, py + 266, 280, maps, selectedMapId, (mapId) => {
      selectedMapId = mapId;
    });
    c.add(mapDropdown.container);
    c.add(this.add.text(cx + 20, py + 238, t("battle_start.lives"), { fontFamily: "Arial, 'Microsoft YaHei', sans-serif", fontSize: "16px", color: "#f6f1e6" }));
    const lifeLabel = this.add.text(cx + 140, py + 238, "2", { fontFamily: "Arial, 'Microsoft YaHei', sans-serif", fontSize: "16px", color: "#34d399" });
    c.add(lifeLabel);
    c.add(this.add.text(cx + 100, py + 238, "<", { fontFamily: "Arial", fontSize: "16px", color: "#b7c7d8" }).setInteractive({ useHandCursor: true }).on("pointerdown", () => lifeLabel.setText(String(Math.max(1, parseInt(lifeLabel.text, 10) - 1)))));
    c.add(this.add.text(cx + 164, py + 238, ">", { fontFamily: "Arial", fontSize: "16px", color: "#b7c7d8" }).setInteractive({ useHandCursor: true }).on("pointerdown", () => lifeLabel.setText(String(Math.min(9, parseInt(lifeLabel.text, 10) + 1)))));
    c.add(createFightButton(this, cx - 80, py + ph - 60, 140, 44, t("battle_start.create"), () => {
      connectionManager.send({ type: "create_room", name: roomName, username: uiSettings.username, password: roomPassword || undefined, mapId: selectedMapId, lifeCount: parseInt(lifeLabel.text, 10), costLimit: 10, p2pEnabled: uiSettings.p2pEnabled });
      c.destroy();
      this.formContainer = null;
      this.activeField = null;
      this.showToast(t("battle_start.creating_room"));
    }, { accent: 0x34d399 }).container);
    c.add(createFightButton(this, cx + 80, py + ph - 60, 140, 44, t("battle_start.cancel"), () => {
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
