import Phaser from "phaser";
import { createRaidLogicRuntime } from "@repo/raid-logic";
import { t } from "@repo/i18n";
import type { AbilityCardId, CharacterId, ServerMessage } from "@repo/types";

import { loadPortraitAssets, queueBattleAssets } from "../battle/utils/assets";
import type { FighterLoadout } from "../battle/loadout";
import { P2pConnection, type PeerConnection, type P2pStatus } from "../network/p2p";
import { connectionManager, getCardById, getCharacterById, type LoadingData, type SceneKey } from "./shared";
import { uiSettings } from "../store/settings";
import { createFittedImage } from "../utils/image-fit";
import { abilityCardIconTextureKey } from "../ability-card-assets";
import BgmCmd from "../commands/BgmCmd";
import {
  bodyStyle,
  drawAngledPanel,
  drawFightingBackdrop,
  headingStyle,
} from "./ui";

const READY_COUNTDOWN_MS = 3_000;

type DisplayFighterLoadout = FighterLoadout & {
  readonly abilityCardIds?: readonly AbilityCardId[];
  readonly activeAbilityCardId?: AbilityCardId;
};

export class LoadingScene extends Phaser.Scene {
  private progress = 0;
  private loadingData!: LoadingData;
  private bar: Phaser.GameObjects.Graphics | undefined;
  private title: Phaser.GameObjects.Text | undefined;
  private label: Phaser.GameObjects.Text | undefined;
  private countdownText: Phaser.GameObjects.Text | undefined;
  private countdownUpdate: (() => void) | undefined;
  private connectionBadge: Phaser.GameObjects.Container | undefined;
  private connectionStatusText: Phaser.GameObjects.Text | undefined;
  private loadoutShowcase: Phaser.GameObjects.GameObject[] | undefined;
  private onlineReady = false;
  private p2pReady = false;
  private peerLoadingReady = false;
  private p2p: PeerConnection | undefined;
  private transitioning = false;
  private loadingDoneSent = false;
  private runtimeReady = false;
  private assetsReady = false;

  constructor() {
    super("loading" satisfies SceneKey);
  }

  init(data: LoadingData): void {
    this.loadingData = data;
    this.progress = 0;
    this.onlineReady = false;
    this.p2pReady = false;
    this.peerLoadingReady = false;
    this.p2p = undefined;
    this.transitioning = false;
    this.loadingDoneSent = false;
    this.runtimeReady = false;
    this.assetsReady = false;
    this.countdownText = undefined;
    this.countdownUpdate = undefined;
    this.loadoutShowcase = undefined;
  }

  preload(): void {
    drawFightingBackdrop(this, "LOADING", "READY");
    this.title = this.add.text(434, 278, t("loading.title"), headingStyle(34));
    this.label = this.add.text(
      444,
      342,
      t("loading.local_checking"),
      bodyStyle("#d7e3ef", 20),
    );
    this.bar = this.add.graphics();
    this.renderProgress();
    loadPortraitAssets(this, () => {
      this.createLoadoutShowcase();
    });

    this.load.on("progress", (value: number) => {
      this.progress = value;
      this.renderProgress();
    });

    const handleComplete = (): void => this.handleAssetLoadComplete();
    this.load.once("complete", handleComplete);

    const queued = queueBattleAssets(this);
    if (queued === 0) {
      this.load.off("complete", handleComplete);
      this.handleAssetLoadComplete();
    }
  }

  create(data: LoadingData): void {
    this.loadingData = data;
    this.label?.setText(
      data.mode === "online" ? t("loading.init_sync") : t("loading.init_local"),
    );

    if (data.mode === "online" || data.mode === "local") {
      this.createConnectionBadge();
      this.setConnectionStatus(t("loading.p2p_init"), 0xffcf6e);
    }

    if (data.mode === "online" || data.mode === "local") {
      this.p2p = data.p2p ?? new P2pConnection(connectionManager, {
        localPlayerId: data.localPlayerId ?? "Player1",
        enabled: data.mode === "local" ? true : data.battleConfig?.p2pEnabled === true,
        stunServer: uiSettings.stunServer,
        onStatus: (status) => this.handleP2pStatus(status),
        onMessage: (message) => this.handleP2pMessage(message),
      });
      this.p2p.setStatusHandler((status) => this.handleP2pStatus(status));
      this.p2p.setMessageHandler((message) => this.handleP2pMessage(message));
      this.p2pReady = this.p2p.status !== "connecting" && this.p2p.status !== "idle";
      if (this.loadingData.mode === "local") {
        this.peerLoadingReady = this.p2p.remoteLoadingDone;
      }
      this.handleP2pStatus(this.p2p.status);
      if (data.mode === "online") {
        connectionManager.setMessageHandler((msg: ServerMessage) => {
          if (!this.scene.isActive()) {
            return;
          }
          if (this.p2p?.handleServerMessage(msg)) {
            return;
          }
          if (msg.type === "room_state" && msg.status === "fighting") {
            this.onlineReady = true;
            this.tryGoToBattle();
          } else if (msg.type === "room_state" && msg.status === "finished") {
            this.label?.setText(t("loading.peer_left_end"));
            this.time.delayedCall(900, () => this.scene.start("home"));
          } else if (msg.type === "peer_status" && msg.status === "disconnected") {
            this.label?.setText(t("loading.peer_disconnect_wait"));
          } else if (msg.type === "peer_status" && msg.status === "reconnected") {
            this.label?.setText(t("loading.peer_reconnected"));
          }
        });
      }
      this.p2p.start();
    }

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      if (this.loadingData.mode === "online") {
        connectionManager.setMessageHandler(null);
        this.p2p?.close();
        this.p2p = undefined;
      }
    });

    this.prepareRuntime();
  }

  private async prepareRuntime(): Promise<void> {
    const runtimeMode = this.loadingData.mode === "ai"
      ? "ai"
      : this.loadingData.mode === "online" || this.loadingData.mode === "local"
        ? "online"
        : "training";
    const runtime = createRaidLogicRuntime({
      mode: runtimeMode,
      loadouts: this.loadingData.loadouts,
      mapId: this.loadingData.mapId ?? this.loadingData.battleConfig?.mapId,
      battleMode: this.loadingData.battleMode ?? this.loadingData.battleConfig?.battleMode,
      playerInitPoint: this.loadingData.playerInitPoint,
      opponentInitPoint: this.loadingData.opponentInitPoint,
      ai: this.loadingData.ai,
      debugCooperate: this.loadingData.debugCooperate,
    });

    await runtime.initialize();
    if (!this.scene.isActive()) return;

    this.loadingData = {
      ...this.loadingData,
      runtime,
    };
    this.runtimeReady = true;

    if (this.loadingData.mode === "online") {
      if (connectionManager.roomStatus === "fighting") {
        this.onlineReady = true;
      } else {
        this.sendLoadingDone();
        this.label?.setText(t("loading.waiting_sync"));
      }
    } else if (this.loadingData.mode === "local") {
      this.onlineReady = true;
      this.maybeSendLoadingDone();
      this.label?.setText(t("loading.local_p2p_connected_wait"));
    }

    this.tryGoToBattle();
  }

  private sendLoadingDone(): void {
    if (this.loadingDoneSent) return;
    if (this.loadingData.mode === "local") {
      if (this.p2p?.send({ type: "loading_done" })) {
        this.loadingDoneSent = true;
      }
      return;
    }
    connectionManager.send({ type: "loading_done" });
    this.loadingDoneSent = true;
  }

  private maybeSendLoadingDone(): void {
    if (!this.runtimeReady || this.loadingDoneSent) {
      return;
    }

    if (this.loadingData.mode === "local") {
      if (!this.p2pReady) {
        return;
      }
      this.sendLoadingDone();
      return;
    }

    this.sendLoadingDone();
  }

  private tryGoToBattle(): void {
    if (!this.assetsReady) return;
    if (!this.runtimeReady) return;
    if (this.loadingData.mode === "local") {
      if (!this.onlineReady || !this.p2pReady || !this.loadingDoneSent || !this.peerLoadingReady) return;
    } else if (this.loadingData.mode === "online" && (!this.onlineReady || !this.p2pReady)) {
      return;
    }
    this.goToBattle();
  }

  private handleAssetLoadComplete(): void {
    const queuedBgm = BgmCmd.QueueLoad(
      this,
      this.loadingData.mapId ?? this.loadingData.battleConfig?.mapId,
    );
    if (queuedBgm > 0) {
      this.load.once("complete", () => this.handleAssetLoadComplete());
      this.time.delayedCall(0, () => this.load.start());
      return;
    }

    this.assetsReady = true;
    this.progress = 1;
    this.renderProgress();
    this.createLoadoutShowcase();
    this.label?.setText(
      this.loadingData.mode === "online"
        ? t("loading.resources_ready_waiting")
        : t("loading.resources_ready"),
    );
    this.tryGoToBattle();
  }

  private renderProgress(): void {
    if (!this.bar) return;
    this.bar.clear();
    drawAngledPanel(this.bar, 436, 394, 410, 34, 0x101820, 0x5c7185, 1);
    this.bar
      .fillStyle(0xe33d44, 1)
      .fillRect(450, 405, 382 * this.progress, 12);
  }

  private goToBattle(): void {
    if (this.transitioning) return;
    this.transitioning = true;
    if (this.loadingData.replayData) {
      // Replay mode: skip countdown, go directly to battle
      this.launchBattle(performance.now());
    } else {
      this.beginReadyCountdown();
    }
  }

  private beginReadyCountdown(): void {
    this.bar?.clear();
    this.bar?.setVisible(false);
    this.title?.destroy();
    this.title = undefined;
    this.label?.setOrigin(0.5)
      .setPosition(640, 342)
      ?.setText(t("loading.get_ready"))
      .setStyle({
        ...bodyStyle("#ffffff", 24),
        fontStyle: "900",
        backgroundColor: "#e33d44",
      })
      .setPadding(18, 8, 18, 8);

    const battleZeroTimeMs = performance.now() + READY_COUNTDOWN_MS;
    this.countdownText = this.add.text(640, 412, "", {
      fontFamily: "Arial, 'Microsoft YaHei', sans-serif",
      fontSize: "34px",
      fontStyle: "900",
      color: "#ffffff",
    }).setOrigin(0.5);

    this.countdownUpdate = () => {
      const remainingMs = Math.max(0, battleZeroTimeMs - performance.now());
      this.countdownText?.setText(formatCountdownSeconds(remainingMs));
    };
    this.events.on(Phaser.Scenes.Events.UPDATE, this.countdownUpdate);
    this.countdownUpdate();
    this.time.delayedCall(READY_COUNTDOWN_MS, () => {
      this.launchBattle(battleZeroTimeMs);
    });
  }

  private launchBattle(battleZeroTimeMs: number): void {
    if (this.countdownUpdate) {
      this.events.off(Phaser.Scenes.Events.UPDATE, this.countdownUpdate);
      this.countdownUpdate = undefined;
    }
    const p2p = this.p2p;
    this.p2p = undefined;
    p2p?.setStatusHandler(undefined);
    p2p?.setMessageHandler(() => undefined);
    this.scene.start("battle", {
      ...this.loadingData,
      p2p,
      battleZeroTimeMs,
    });
  }

  private handleP2pStatus(status: P2pStatus): void {
    if (!this.scene.isActive()) {
      return;
    }
    if (status === "connecting") {
      this.p2pReady = false;
      this.setConnectionStatus(t("loading.p2p_trying"), 0xffcf6e);
      this.label?.setText(this.loadingData.mode === "local" ? t("loading.p2p_attempt") : t("loading.p2p_attempt_online"));
      return;
    }

    this.p2pReady = this.loadingData.mode === "local" ? status === "connected" : true;

    if (status === "connected") {
      this.setConnectionStatus(t("loading.p2p_connected"), 0x34d399);
      this.label?.setText(this.loadingData.mode === "local" ? t("loading.local_p2p_connected_wait") : t("loading.p2p_connected_wait_online"));
      this.maybeSendLoadingDone();
    } else if (status === "failed") {
      this.setConnectionStatus(t("loading.p2p_unavailable"), 0xff5c66);
      this.label?.setText(this.loadingData.mode === "local" ? t("loading.p2p_fallback_local") : t("loading.p2p_fallback_online"));
    } else if (status === "disabled") {
      this.setConnectionStatus(t("loading.p2p_closed"), 0x9fb4c8);
      this.label?.setText(this.loadingData.mode === "local" ? t("loading.p2p_closed_local") : t("loading.p2p_closed_online"));
    }

    this.tryGoToBattle();
  }

  private handleP2pMessage(message: ServerMessage): void {
    if (!this.scene.isActive()) {
      return;
    }

    if (message.type === "peer_loading_done" && message.playerId !== (this.loadingData.localPlayerId ?? "Player1")) {
      this.peerLoadingReady = true;
      this.tryGoToBattle();
    }
  }

  private createConnectionBadge(): void {
    if (this.connectionBadge) return;

    const badge = this.add.container(20, 20).setDepth(40);
    const background = this.add.graphics();
    drawAngledPanel(background, 0, 0, 264, 52, 0x101820, 0x5c7185, 0.96);
    const text = this.add.text(18, 13, t("loading.p2p_init"), {
      fontFamily: "Arial, 'Microsoft YaHei', sans-serif",
      fontSize: "18px",
      fontStyle: "700",
      color: "#ffcf6e",
    });

    badge.add(background);
    badge.add(text);
    this.connectionBadge = badge;
    this.connectionStatusText = text;
  }

  private setConnectionStatus(text: string, color: number): void {
    if (!this.scene.isActive()) {
      return;
    }
    if (!this.connectionBadge) {
      this.createConnectionBadge();
    }
    this.connectionStatusText?.setText(text);
    this.connectionStatusText?.setColor(`#${color.toString(16).padStart(6, "0")}`);
    this.connectionBadge?.setVisible(true);
  }

  private createLoadoutShowcase(): void {
    const slots = this.resolveLoadoutSlots();
    if (!slots) return;

    this.loadoutShowcase?.forEach((object) => object.destroy());
    const objects: Phaser.GameObjects.GameObject[] = [];
    this.loadoutShowcase = objects;

    this.drawLoadoutPanel(objects, 24, 108, 192, 504, slots.left.loadout, slots.left.name, "#34d399", 0x34d399);
    this.drawLoadoutPanel(objects, 1064, 108, 192, 504, slots.right.loadout, slots.right.name, "#ff5c66", 0xe33d44);
  }

  private resolveLoadoutSlots(): {
    readonly left: { readonly loadout: DisplayFighterLoadout; readonly name: string };
    readonly right: { readonly loadout: DisplayFighterLoadout; readonly name: string };
  } | null {
    const loadouts = this.loadingData.loadouts;
    if (!loadouts) return null;

    const player = loadouts.player as DisplayFighterLoadout;
    const target = loadouts.target as DisplayFighterLoadout;
    const localName = this.loadingData.playerName ?? uiSettings.username;
    const opponentName = this.loadingData.opponentName ?? t("select.opponent");
    if (this.loadingData.localPlayerId === "Player2") {
      return {
        left: { loadout: target, name: localName },
        right: { loadout: player, name: opponentName },
      };
    }
    return {
      left: { loadout: player, name: localName },
      right: { loadout: target, name: opponentName },
    };
  }

  private drawLoadoutPanel(
    objects: Phaser.GameObjects.GameObject[],
    x: number,
    y: number,
    width: number,
    height: number,
    loadout: DisplayFighterLoadout,
    playerName: string,
    accentColor: string,
    accent: number,
  ): void {
    const panel = this.add.graphics();
    drawAngledPanel(panel, x, y, width, height, 0x0b1118, accent, 0.88);
    panel.setDepth(12);
    objects.push(panel);
    const name = this.add.text(x + width / 2, y + 20, compactName(playerName, 12), {
      fontFamily: "Arial, 'Microsoft YaHei', sans-serif",
      fontSize: "16px",
      fontStyle: "900",
      color: "#f6f1e6",
      backgroundColor: "#101820cc",
      padding: { x: 8, y: 3 },
    }).setOrigin(0.5).setDepth(22);
    objects.push(name);

    this.drawCharacterPreview(
      objects,
      x + 104,
      y + 90,
      72,
      126,
      loadout.alternateCharacterId as CharacterId,
      false,
    );
    this.drawCharacterPreview(
      objects,
      x + 30,
      y + 124,
      132,
      230,
      loadout.primaryCharacterId as CharacterId,
      true,
    );
    this.drawAbilityCards(objects, x + 22, y + height - 142, width - 44, loadout, accentColor);
  }

  private drawCharacterPreview(
    objects: Phaser.GameObjects.GameObject[],
    x: number,
    y: number,
    width: number,
    height: number,
    characterId: CharacterId,
    primary: boolean,
  ): void {
    const character = getCharacterById(characterId);
    const graphics = this.add.graphics();

    graphics.setDepth(primary ? 16 : 13);
    objects.push(graphics);

    const imageKey = `character-portrait-${character.id}`;
    if (this.textures.exists(imageKey)) {
      const image = this.add.image(x + width / 2, y + height / 2, imageKey).setOrigin(0.5);
      fitTextureFrameToBounds(image, width, height);
      image.setAlpha(primary ? 1 : 0.78);
      image.setDepth(primary ? 17 : 14);
      objects.push(image);
    }
  }

  private drawAbilityCards(
    objects: Phaser.GameObjects.GameObject[],
    x: number,
    y: number,
    width: number,
    loadout: DisplayFighterLoadout,
    accentColor: string,
  ): void {
    const cardIds = loadoutCardIds(loadout);
    const cards = cardIds.slice(0, 6);
    const cardWidth = 48;
    const cardHeight = 58;
    const gap = 8;
    const columns = 3;
    const startX = x + Math.max(0, (width - (columns * cardWidth + (columns - 1) * gap)) / 2);

    for (const [index, cardId] of cards.entries()) {
      const card = getCardById(cardId);
      const col = index % columns;
      const row = Math.floor(index / columns);
      const cx = startX + col * (cardWidth + gap);
      const cy = y + row * (cardHeight + gap);

      const iconKey = abilityCardIconTextureKey(card.id);
      if (this.textures.exists(iconKey)) {
        const preview = createFittedImage(this, cx + cardWidth / 2, cy + 24, iconKey, cardWidth - 10, cardHeight - 28, "contain");
        preview.setDepth(20);
        objects.push(preview);
      }

      const label = this.add.text(cx + cardWidth / 2, cy + cardHeight - 11, compactName(card.name, 4), {
        fontFamily: "Arial, 'Microsoft YaHei', sans-serif",
        fontSize: "10px",
        fontStyle: "700",
        color: accentColor,
        backgroundColor: "#101820cc",
        padding: { x: 3, y: 1 },
      }).setOrigin(0.5).setDepth(21);
      objects.push(label);
    }
  }
}

function formatCountdownSeconds(remainingMs: number): string {
  return (remainingMs / 1_000).toFixed(3);
}

function loadoutCardIds(loadout: DisplayFighterLoadout): readonly AbilityCardId[] {
  const ids = new Set<AbilityCardId>(loadout.cardIds ?? loadout.abilityCardIds ?? []);
  const activeCardId = loadout.activeCardId ?? loadout.activeAbilityCardId;
  if (activeCardId) {
    ids.add(activeCardId);
  }
  return [...ids];
}

function compactName(name: string, maxLength: number): string {
  const chars = Array.from(name);
  return chars.length <= maxLength ? name : `${chars.slice(0, Math.max(1, maxLength - 3)).join("")}...`;
}

function fitTextureFrameToBounds(
  image: Phaser.GameObjects.Image,
  width: number,
  height: number,
): void {
  const frame = image.frame;
  const sourceWidth = frame.realWidth || frame.width || image.width || 1;
  const sourceHeight = frame.realHeight || frame.height || image.height || 1;
  const scale = Math.min(width / sourceWidth, height / sourceHeight);
  image.setScale(scale);
}
