import Phaser from "phaser";
import { t } from "@repo/i18n";
import type { PlayerId, RoomSummary, ServerMessage } from "@repo/types";

import { createFightButton, createTextField, drawAngledPanel, drawFightingBackdrop } from "./ui";
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
