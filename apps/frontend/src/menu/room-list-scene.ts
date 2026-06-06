import Phaser from "phaser";
import { MAX_ROOM_NAME_LENGTH } from "@repo/constants";
import { getAvailableCombatMaps } from "@repo/content";
import { t } from "@repo/i18n";
import type { MapId, PlayerId, RoomSummary, ServerMessage } from "@repo/types";

import { createFightButton, createTextField, drawAngledPanel, drawFightingBackdrop } from "./ui";
import { createMapDropdown } from "./map-dialog";
import { connectionManager, installMenuAudioUnlock, type SceneKey, type SelectionData, type TextFieldControl } from "./shared";
import { uiSettings } from "../store/settings";

const PAGE_SIZE = 12;

export class RoomListScene extends Phaser.Scene {
  private rooms: RoomSummary[] = [];
  private page = 1;
  private totalPages = 1;
  private listLayer!: Phaser.GameObjects.Container;
  private pageLabel!: Phaser.GameObjects.Text;
  private roomIdValue = "";
  private activeField: TextFieldControl | null = null;
  private pendingJoinRoomId: string | null = null;
  private passwordDialog: Phaser.GameObjects.Container | null = null;
  private createRoomDialog: Phaser.GameObjects.Container | null = null;

  private readonly onKeyDown = (event: KeyboardEvent) => this.activeField?.handleKey(event);
  private readonly onPaste = (event: ClipboardEvent) => this.activeField?.handlePaste(event.clipboardData?.getData("text") ?? "");

  constructor() {
    super("room-list" satisfies SceneKey);
  }

  create(): void {
    installMenuAudioUnlock(this);
    drawFightingBackdrop(this, "ROOMS", "ONLINE LIST");
    this.add.text(90, 74, t("room_list.title"), {
      fontFamily: "Arial, 'Microsoft YaHei', sans-serif",
      fontSize: "42px",
      fontStyle: "900",
      color: "#f6f1e6",
    });
    createFightButton(this, 1138, 62, 160, 44, t("room_list.back"), () => this.scene.start("battle-start"), { accent: 0x5c7185 });

    this.listLayer = this.add.container(0, 0);
    this.pageLabel = this.add.text(640, 680, "", {
      fontFamily: "Arial, 'Microsoft YaHei', sans-serif",
      fontSize: "16px",
      color: "#b7c7d8",
    }).setOrigin(0.5);

    createFightButton(this, 178, 681, 150, 46, t("room_list.quick_match"), () => this.tryQuickMatch(), { accent: 0x34d399 });
    createFightButton(this, 344, 681, 150, 46, t("room_list.create_room"), () => this.showCreateRoom(), { accent: 0xe33d44 });

    this.add.text(800, 634, t("room_list.room_id"), {
      fontFamily: "Arial, 'Microsoft YaHei', sans-serif",
      fontSize: "14px",
      color: "#9fb4c8",
    });
    const field = createTextField(this, 800, 658, 170, {
      value: "",
      maxLength: 16,
      onFocus: (focusedField) => { this.activeField = focusedField; },
      onChange: (v) => { this.roomIdValue = v.trim(); },
    });
    this.activeField = field;

    createFightButton(this, 1010, 681, 110, 46, t("room_list.join"), () => this.tryJoin(this.roomIdValue), { accent: 0x34d399 });
    createFightButton(this, 1128, 681, 54, 46, "<", () => this.gotoPage(this.page - 1), { accent: 0x5c7185 });
    createFightButton(this, 1192, 681, 54, 46, ">", () => this.gotoPage(this.page + 1), { accent: 0x5c7185 });

    connectionManager.setMessageHandler((msg) => this.onServerMessage(msg));
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("paste", this.onPaste);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      connectionManager.setMessageHandler(null);
      window.removeEventListener("keydown", this.onKeyDown);
      window.removeEventListener("paste", this.onPaste);
      this.createRoomDialog?.destroy();
      this.createRoomDialog = null;
    });
    this.requestRooms();
  }

  private requestRooms(): void {
    connectionManager.send({ type: "list_rooms", page: this.page, pageSize: PAGE_SIZE });
  }

  private gotoPage(nextPage: number): void {
    this.page = Phaser.Math.Clamp(nextPage, 1, this.totalPages);
    this.requestRooms();
  }

  private tryQuickMatch(): void {
    connectionManager.send({ type: "quick_match", username: uiSettings.username, p2pEnabled: uiSettings.p2pEnabled });
  }

  private showCreateRoom(): void {
    if (this.createRoomDialog) {
      this.createRoomDialog.destroy();
      this.createRoomDialog = null;
      this.activeField = null;
      return;
    }

    const cx = 640;
    const cy = 420;
    const c = this.add.container(0, 0);
    this.createRoomDialog = c;
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
      this.createRoomDialog = null;
      this.activeField = null;
      this.showToast(t("battle_start.creating_room"));
    }, { accent: 0x34d399 }).container);
    c.add(createFightButton(this, cx + 80, py + ph - 60, 140, 44, t("battle_start.cancel"), () => {
      c.destroy();
      this.createRoomDialog = null;
      this.activeField = null;
    }, { accent: 0x5c7185 }).container);
  }

  private renderList(): void {
    this.listLayer.destroy();
    this.listLayer = this.add.container(0, 0);
    for (let i = 0; i < PAGE_SIZE; i += 1) {
      const col = i < 6 ? 0 : 1;
      const row = i % 6;
      this.drawRoomItem(92 + col * 590, 150 + row * 82, 520, 70, this.rooms[i]);
    }
    this.pageLabel.setText(`${this.page} / ${this.totalPages}`);
  }

  private drawRoomItem(x: number, y: number, width: number, height: number, room?: RoomSummary): void {
    const g = this.add.graphics();
    drawAngledPanel(g, x, y, width, height, room ? 0x111821 : 0x0b1118, room ? 0x34475c : 0x1f2a38, 0.94);
    this.listLayer.add(g);
    if (!room) return;

    this.listLayer.add(this.add.rectangle(x, y, width, height, 0xffffff, 0.001)
      .setOrigin(0, 0)
      .setInteractive({ useHandCursor: true })
      .on("pointerup", () => {
        this.roomIdValue = room.id;
        if (room.hasPassword) this.showPasswordDialog(room.id);
        else this.tryJoin(room.id);
      }));
    this.listLayer.add(this.add.text(x + 24, y + 13, room.name, {
      fontFamily: "Arial, 'Microsoft YaHei', sans-serif",
      fontSize: "20px",
      fontStyle: "700",
      color: "#f6f1e6",
    }));
    this.listLayer.add(this.add.text(x + 24, y + 42, t("room_list.host", { name: room.hostName || "-", count: room.playerCount, max: room.maxPlayers, id: room.id }), {
      fontFamily: "Arial, 'Microsoft YaHei', sans-serif",
      fontSize: "14px",
      color: "#9fb4c8",
    }));
    if (room.hasPassword) {
      this.listLayer.add(this.add.text(x + width - 42, y + 22, t("room_list.lock"), {
        fontFamily: "Arial, 'Microsoft YaHei', sans-serif",
        fontSize: "14px",
        fontStyle: "700",
        color: "#ffcf6e",
      }));
    }
  }

  private tryJoin(roomId: string, password?: string): void {
    if (!roomId) {
      this.showToast(t("room_list.enter_room_id"));
      return;
    }
    this.pendingJoinRoomId = roomId;
    connectionManager.send({ type: "join_room", roomId, username: uiSettings.username, password, p2pEnabled: uiSettings.p2pEnabled });
  }

  private showPasswordDialog(roomId: string): void {
    this.passwordDialog?.destroy();
    const c = this.add.container(0, 0);
    this.passwordDialog = c;
    let password = "";
    c.add(this.add.rectangle(640, 360, 1280, 720, 0x000000, 0.55).setInteractive());
    const bg = this.add.graphics();
    drawAngledPanel(bg, 430, 250, 420, 210, 0x111821, 0x5c7185, 0.98);
    c.add(bg);
    c.add(this.add.text(640, 282, t("room_list.password"), {
      fontFamily: "Arial, 'Microsoft YaHei', sans-serif",
      fontSize: "22px",
      fontStyle: "700",
      color: "#ffcf6e",
    }).setOrigin(0.5));
    const field = createTextField(this, 500, 330, 280, {
      value: "",
      maxLength: 32,
      onFocus: (focusedField) => { this.activeField = focusedField; },
      onChange: (v) => { password = v; },
    });
    field.setActive(true);
    this.activeField = field;
    c.add(field.container);
    c.add(createFightButton(this, 560, 420, 130, 42, t("room_list.password_cancel"), () => {
      c.destroy();
      this.passwordDialog = null;
      this.activeField = null;
    }, { accent: 0x5c7185 }).container);
    c.add(createFightButton(this, 720, 420, 130, 42, t("room_list.password_confirm"), () => {
      c.destroy();
      this.passwordDialog = null;
      this.activeField = null;
      this.tryJoin(roomId, password);
    }, { accent: 0x34d399 }).container);
  }

  private onServerMessage(msg: ServerMessage): void {
    switch (msg.type) {
      case "room_list":
        this.rooms = msg.rooms;
        this.page = msg.page;
        this.totalPages = msg.totalPages;
        this.renderList();
        break;
      case "room_joined":
        this.scene.start("lobby", { mode: "online", roomId: msg.roomId, playerId: msg.playerId as PlayerId } satisfies SelectionData);
        break;
      case "error":
        if (msg.code === "wrong_password" && this.pendingJoinRoomId) this.showPasswordDialog(this.pendingJoinRoomId);
        else this.showToast(`${msg.code}: ${msg.message}`);
        break;
    }
  }

  private showToast(message: string): void {
    const toast = this.add.text(640, 604, message, {
      fontFamily: "Arial, 'Microsoft YaHei', sans-serif",
      fontSize: "16px",
      color: "#ffcf6e",
      backgroundColor: "#111821ee",
      padding: { x: 16, y: 8 },
    }).setOrigin(0.5).setAlpha(0);
    this.tweens.add({ targets: toast, alpha: 1, duration: 180, yoyo: true, hold: 1800, onComplete: () => toast.destroy() });
  }
}
