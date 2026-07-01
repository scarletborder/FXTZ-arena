import Phaser from "phaser";
import { IS_DESKTOP_APP } from "@repo/constants";
import { t } from "@repo/i18n";
import type { BattleRoomMode, PlayerId } from "@repo/types";

import type { ConnectionStatus } from "../network";
import { settingsRepository } from "../store/settings";
import { showMapDialog } from "./map-dialog";
import { connectionManager, type SceneKey, type SelectionData } from "./shared";
import { createBackButton, createFightButton, drawFightingBackdrop, drawPanel } from "./ui";

export class BattleStartScene extends Phaser.Scene {
  private indicator!: Phaser.GameObjects.Graphics;
  private statusLabel!: Phaser.GameObjects.Text;
  private roomListBtn!: { setEnabled(enabled: boolean): void; container: Phaser.GameObjects.Container };
  private localLanBtn!: { setEnabled(enabled: boolean): void; container: Phaser.GameObjects.Container };
  private mapDialogContainer: Phaser.GameObjects.Container | null = null;
  private unsubscribeStatus: (() => void) | null = null;

  constructor() {
    super("battle-start" satisfies SceneKey);
  }

  create(): void {
    drawFightingBackdrop(this, "BATTLE", "VERSUS ENTRY");
    createBackButton(this);
    this.add.text(90, 74, t("battle_start.title"), { fontFamily: "Arial, 'Microsoft YaHei', sans-serif", fontSize: "42px", fontStyle: "900", color: "#f6f1e6" });

    this.indicator = this.add.graphics();
    this.statusLabel = this.add.text(105, 133, "", { fontFamily: "Arial, 'Microsoft YaHei', sans-serif", fontSize: "14px", color: "#b7c7d8" });
    this.drawIndicator("disconnected");

    drawPanel(this, 72, 176, 520, 432, t("battle_start.online"));
    drawPanel(this, 686, 146, 520, 492, t("battle_start.local"));
    this.roomListBtn = createFightButton(this, 332, 272, 330, 70, t("battle_start.room_list"), () => this.scene.start("room-list"), { enabled: false, subLabel: t("battle_start.browse_rooms") });
    this.localLanBtn = createFightButton(this, 332, 374, 330, 70, t("battle_start.local_lan"), () => this.scene.start("local-lan"), { enabled: false, subLabel: t("battle_start.discover_lan_players") });
    createFightButton(this, 332, 462, 330, 62, t("battle_start.udp_connect"), () => this.scene.start("udp-connect"), {
      enabled: IS_DESKTOP_APP,
      subLabel: IS_DESKTOP_APP ? t("battle_start.udp_connect_ready") : t("battle_start.use_desktop_client"),
      accent: 0x26c6da,
    });

    createFightButton(this, 946, 274, 360, 74, t("battle_start.story_mode"), () => this.scene.start("story-start-loadout"), { accent: 0x5c7185 });
    createFightButton(this, 946, 372, 360, 74, t("battle_start.local_single_battle"), () => showMapDialog(this, this.mapDialogContainer, (container) => {
      this.mapDialogContainer = container;
    }, (mapId) => {
      this.scene.start("select", { mode: "local_single", mapId } satisfies SelectionData);
    }, { accent: 0x26c6da }), { subLabel: t("battle_start.local_single_battle_hint"), accent: 0x26c6da });
    createFightButton(this, 946, 470, 360, 74, t("battle_start.ai_battle"), () => showMapDialog(this, this.mapDialogContainer, (container) => {
      this.mapDialogContainer = container;
    }, (mapId, cpuLoadoutPresetId) => {
      this.scene.start("select", { mode: "ai", mapId, cpuLoadoutPresetId } satisfies SelectionData);
    }, { showCpuLoadout: true }), { subLabel: t("battle_start.choose_loadout"), accent: 0xe33d44 });
    createFightButton(this, 946, 568, 360, 74, t("battle_start.training"), () => this.scene.start("select", { mode: "training" } satisfies SelectionData), { subLabel: t("battle_start.no_cost_limit"), accent: 0x5c7185 });

    const updateConnectionState = (s: ConnectionStatus) => {
      const connected = s === "connected";
      this.drawIndicator(s);
      this.roomListBtn.setEnabled(connected);
      this.localLanBtn.setEnabled(connected);
    };
    this.unsubscribeStatus = connectionManager.addStatusListener(updateConnectionState);
    updateConnectionState(connectionManager.status);
    connectionManager.setMessageHandler((msg) => this.onServerMessage(msg));
    console.log("[FXTZ] Connecting to server", {
      address: settingsRepository.get().serverAddress,
      username: settingsRepository.get().username,
    });
    connectionManager.connect(settingsRepository.get().serverAddress, settingsRepository.get().username);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      connectionManager.setMessageHandler(null);
      this.unsubscribeStatus?.();
      this.unsubscribeStatus = null;
      this.mapDialogContainer?.destroy();
      this.mapDialogContainer = null;
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
      const battleMode = m.battleMode as BattleRoomMode | undefined;
      if (battleMode) {
        connectionManager.battleMode = battleMode;
      }
      if (playerId && roomId) this.scene.start("lobby", { mode: "online", roomId, playerId, battleMode } satisfies SelectionData);
    } else if (m.type === "error") {
      this.showToast(`${String(m.code)}: ${String(m.message)}`);
    }
  }

  private showToast(message: string): void {
    const toast = this.add.text(640, 660, message, { fontFamily: "Arial, 'Microsoft YaHei', sans-serif", fontSize: "16px", color: "#ffcf6e", backgroundColor: "#111821ee", padding: { x: 16, y: 8 } }).setOrigin(0.5).setAlpha(0);
    this.tweens.add({ targets: toast, alpha: 1, duration: 200, yoyo: true, hold: 2000, onComplete: () => toast.destroy() });
  }
}
