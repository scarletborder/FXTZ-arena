import Phaser from "phaser";
import { t } from "@repo/i18n";
import type { BattleConfig, ServerMessage } from "@repo/types";

import { queueBattleAssets } from "../../battle/assets";
import type { BattleLoadouts } from "../../battle/loadout";
import BgmCmd from "../../commands/BgmCmd";
import { connectionManager, type SceneKey } from "../../menu/shared";
import { bodyStyle, createFightButton, drawAngledPanel, drawFightingBackdrop, headingStyle } from "../../menu/ui";
import type { UdpDirectSession } from "../../network/udp-direct-session";
import { SpectatorInputBuffer } from "./spectator-buffer";

export interface SpectatorLoadingData {
  readonly source: "online" | "udp";
  readonly roomId?: string;
  readonly udpSession?: UdpDirectSession | null;
}

export class SpectatorLoadingScene extends Phaser.Scene {
  private readonly inputBuffer = new SpectatorInputBuffer();
  private statusText!: Phaser.GameObjects.Text;
  private headerText!: Phaser.GameObjects.Text;
  private bar!: Phaser.GameObjects.Graphics;
  private progress = 0;
  private battleConfig: BattleConfig | undefined;
  private loadingData: SpectatorLoadingData | undefined;
  private assetsReady = false;
  private firstBattleFrameReady = false;
  private transitioning = false;

  constructor() {
    super("spectator-loading" satisfies SceneKey);
  }

  init(): void {
    this.progress = 0;
    this.battleConfig = undefined;
    this.assetsReady = false;
    this.firstBattleFrameReady = false;
    this.transitioning = false;
  }

  preload(): void {
    drawFightingBackdrop(this, "SPECTATE", "WATCH");
    this.headerText = this.add.text(24, 24, t("spectator.players_waiting"), bodyStyle("#d7e3ef", 16)).setDepth(20);
    this.add.text(434, 278, t("spectator.loading_title"), headingStyle(34));
    this.statusText = this.add.text(444, 342, t("spectator.wait_room_start"), bodyStyle("#d7e3ef", 20));
    this.bar = this.add.graphics();
    this.renderProgress();
    createFightButton(this, 1160, 56, 170, 44, t("spectator.cancel"), () => this.cancelSpectating(), { accent: 0xff5c66 });

    this.load.on("progress", (value: number) => {
      this.progress = value;
      this.renderProgress();
    });
  }

  create(data: SpectatorLoadingData): void {
    this.loadingData = data;
    if (data.source === "udp") {
      data.udpSession?.setSpectatorMessageHandler((message) => this.handleServerMessage(message));
      this.headerText.setText(t("spectator.players_waiting"));
    } else {
      connectionManager.setMessageHandler((message) => this.handleServerMessage(message));
      this.updateHeader();
      if (connectionManager.battleConfig) {
        this.prepareBattle(connectionManager.battleConfig);
      } else if (connectionManager.roomStatus) {
        this.setStatusForRoomStatus(connectionManager.roomStatus);
      }
    }

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      if (this.loadingData?.source === "online") {
        connectionManager.setMessageHandler(null);
      } else {
        this.loadingData?.udpSession?.setSpectatorMessageHandler(null);
      }
    });
  }

  private handleServerMessage(message: ServerMessage): void {
    if (message.type === "input_frame") {
      this.inputBuffer.push(message);
      if (this.inputBuffer.hasPair(1)) {
        this.firstBattleFrameReady = true;
        this.tryLaunchBattle();
      }
      return;
    }
    if (message.type === "room_state") {
      this.updateHeader();
      this.setStatusForRoomStatus(message.status);
      if (message.status === "finished") {
        this.time.delayedCall(700, () => this.scene.start("room-list"));
      }
      return;
    }
    if (message.type === "game_starting") {
      this.statusText.setText(t("spectator.wait_loadout"));
      return;
    }
    if (message.type === "battle_start") {
      this.prepareBattle(message.config);
    }
  }

  private prepareBattle(config: BattleConfig): void {
    if (this.battleConfig) {
      return;
    }
    this.battleConfig = config;
    this.statusText.setText(t("spectator.loading_resources"));
    const queuedBattle = queueBattleAssets(this);
    const queuedBgm = BgmCmd.QueueLoad(this, config.mapId);
    const queued = queuedBattle + queuedBgm;
    if (queued === 0) {
      this.finishAssets();
      return;
    }
    this.load.once("complete", () => this.finishAssets());
    this.time.delayedCall(0, () => this.load.start());
  }

  private finishAssets(): void {
    this.assetsReady = true;
    this.progress = 1;
    this.renderProgress();
    this.statusText.setText(t("spectator.wait_game_start"));
    this.tryLaunchBattle();
  }

  private tryLaunchBattle(): void {
    if (this.transitioning || !this.assetsReady || !this.battleConfig || !this.firstBattleFrameReady) {
      return;
    }
    this.transitioning = true;
    const config = this.battleConfig;
    const loadouts: BattleLoadouts = {
      player: {
        primaryCharacterId: config.players[0].loadout.primaryCharacterId,
        alternateCharacterId: config.players[0].loadout.alternateCharacterId,
        cardIds: config.players[0].loadout.abilityCardIds,
        activeCardId: config.players[0].loadout.activeAbilityCardId,
      },
      target: {
        primaryCharacterId: config.players[1].loadout.primaryCharacterId,
        alternateCharacterId: config.players[1].loadout.alternateCharacterId,
        cardIds: config.players[1].loadout.abilityCardIds,
        activeCardId: config.players[1].loadout.activeAbilityCardId,
      },
    };
    this.scene.start("battle", {
      mode: "online",
      playerName: config.players[0].username,
      opponentName: config.players[1].username,
      returnScene: "room-list",
      loadouts,
      mapId: config.mapId,
      battleConfig: config,
      spectatorData: {
        battleConfig: config,
        inputBuffer: this.inputBuffer,
        exitScene: "room-list",
        udpSession: this.loadingData?.udpSession,
      },
    });
  }

  private setStatusForRoomStatus(status: string): void {
    const key = status === "waiting"
      ? "spectator.wait_room_start"
      : status === "selecting"
        ? "spectator.wait_loadout"
        : status === "loading"
          ? "spectator.wait_player_loading"
          : status === "fighting"
            ? "spectator.wait_game_start"
            : "spectator.finished";
    this.statusText.setText(t(key as any));
  }

  private updateHeader(): void {
    const names = connectionManager.playerNames.filter(Boolean);
    this.headerText.setText(names.length > 0 ? t("spectator.players", { names: names.join(" / ") }) : t("spectator.players_waiting"));
  }

  private renderProgress(): void {
    if (!this.bar) return;
    this.bar.clear();
    drawAngledPanel(this.bar, 436, 394, 410, 34, 0x101820, 0x5c7185, 1);
    this.bar.fillStyle(0x26c6da, 1).fillRect(450, 405, 382 * this.progress, 12);
  }

  private cancelSpectating(): void {
    if (this.loadingData?.source === "online") {
      connectionManager.send({ type: "leave_room" });
    }
    this.loadingData?.udpSession?.close();
    this.scene.start("room-list");
  }
}
