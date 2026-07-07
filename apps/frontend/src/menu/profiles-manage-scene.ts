import Phaser from "phaser";
import { MAX_PLAYER_NAME_LENGTH } from "@repo/constants";
import { t } from "@repo/i18n";

import {
  bodyStyle,
  createBackButton,
  createRectangleButton,
  createTextField,
  drawFightingBackdrop,
  headingStyle,
} from "./ui";
import type { SceneKey, TextFieldControl } from "./shared";
import { setEditingProfileId } from "./profile-edit-context";
import {
  createProfile,
  deleteProfile,
  getProfile,
  importProfile,
  listProfiles,
  parseImportedProfile,
  saveProfile,
  serializeProfile,
  shortProfileHash,
  type LocalInputProfile,
} from "../store/profile-repository";

const LIST_X = 74;
const LIST_Y = 150;
const LIST_W = 660;
const LIST_H = 470;
const PREVIEW_X = 770;
const PREVIEW_Y = 150;

export class ProfilesManageScene extends Phaser.Scene {
  private selectedProfileId = "default";
  private listLayer: Phaser.GameObjects.Container | undefined;
  private previewLayer: Phaser.GameObjects.Container | undefined;
  private activeField: TextFieldControl | undefined;
  private statusText: Phaser.GameObjects.Text | undefined;
  private statusMessage = "";
  private confirmDialog: Phaser.GameObjects.Container | undefined;
  private listScrollY = 0;

  constructor() {
    super("profiles-manage" satisfies SceneKey);
  }

  create(): void {
    drawFightingBackdrop(this, "PROFILE", "MANAGE");
    createBackButton(this, "settings", 1138, 62);
    this.add.text(90, 72, t("settings.profiles.title"), headingStyle(42));
    this.listLayer = this.add.container(LIST_X, LIST_Y);
    this.previewLayer = this.add.container(PREVIEW_X, PREVIEW_Y);
    if (!listProfiles().some((profile) => profile.id === this.selectedProfileId)) {
      this.selectedProfileId = listProfiles()[0]?.id ?? "default";
    }
    this.renderList();
    this.renderPreview();
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.confirmDialog?.destroy();
      this.activeField = undefined;
    });
  }

  private renderList(): void {
    this.listLayer?.removeAll(true);
    const layer = this.listLayer;
    if (!layer) return;
    const frame = this.add.graphics();
    frame.fillStyle(0x101820, 0.92).fillRect(0, 0, LIST_W, LIST_H);
    frame.lineStyle(2, 0x34475c, 0.9).strokeRect(0, 0, LIST_W, LIST_H);
    layer.add(frame);

    const viewport = this.add.container(0, 0);
    const profiles = listProfiles();
    profiles.forEach((profile, index) => {
      viewport.add(this.createProfileItem(18, 18 + index * 68, profile));
    });
    viewport.add(this.createCreateItem(18, 18 + profiles.length * 68));

    const maskShape = this.make.graphics({ x: 0, y: 0 });
    maskShape.fillStyle(0xffffff, 1).fillRect(LIST_X, LIST_Y, LIST_W, LIST_H);
    viewport.enableFilters();
    viewport.filters?.internal.addMask(maskShape);
    layer.add(viewport);

    const contentHeight = 18 + (profiles.length + 1) * 68;
    const maxScroll = Math.max(0, contentHeight - LIST_H + 18);
    let scrollY = Phaser.Math.Clamp(this.listScrollY, 0, maxScroll);
    let dragging = false;
    let lastY = 0;
    const setScroll = (next: number) => {
      scrollY = Phaser.Math.Clamp(next, 0, maxScroll);
      this.listScrollY = scrollY;
      viewport.y = -scrollY;
    };
    setScroll(scrollY);
    const onPointerDown = (pointer: Phaser.Input.Pointer) => {
      const point = this.listLayer?.getWorldTransformMatrix().applyInverse(pointer.x, pointer.y);
      if (!point || point.x < 0 || point.x > LIST_W || point.y < 0 || point.y > LIST_H) {
        return;
      }
      dragging = true;
      lastY = pointer.y;
    };
    this.input.on("pointerdown", onPointerDown);
    const onPointerMove = (pointer: Phaser.Input.Pointer) => {
      if (!dragging) return;
      setScroll(scrollY + lastY - pointer.y);
      lastY = pointer.y;
    };
    const onPointerUp = () => {
      dragging = false;
    };
    const onWheel = (_pointer: Phaser.Input.Pointer, _objects: unknown, _dx: number, dy: number) => {
      setScroll(scrollY + dy);
    };
    this.input.on("pointermove", onPointerMove);
    this.input.on("pointerup", onPointerUp);
    this.input.on("wheel", onWheel);
    layer.once(Phaser.GameObjects.Events.DESTROY, () => {
      this.input.off("pointerdown", onPointerDown);
      this.input.off("pointermove", onPointerMove);
      this.input.off("pointerup", onPointerUp);
      this.input.off("wheel", onWheel);
      maskShape.destroy();
    });
  }

  private createProfileItem(x: number, y: number, profile: LocalInputProfile): Phaser.GameObjects.Container {
    const selected = profile.id === this.selectedProfileId;
    const item = this.add.container(x, y);
    const background = this.add.graphics();
    background.fillStyle(selected ? 0x202a38 : 0x151b26, 0.98).fillRect(0, 0, LIST_W - 36, 56);
    background.lineStyle(2, selected ? 0xffcf6e : 0x5c7185, 1).strokeRect(0, 0, LIST_W - 36, 56);
    item.add(background);
    item.add(this.add.text(16, 9, profile.username, bodyStyle("#f6f1e6", 17)));
    item.add(this.add.text(220, 9, `#${shortProfileHash(profile)}`, bodyStyle("#9fd8ff", 15)));
    item.add(this.add.text(400, 9, formatTime(profile.createdAt), bodyStyle("#b7c7d8", 15)));
    const hit = this.add.rectangle(0, 0, LIST_W - 36, 56, 0xffffff, 0.001).setOrigin(0, 0).setInteractive({ useHandCursor: true });
    hit.on("pointerup", () => {
      this.selectedProfileId = profile.id;
      this.statusMessage = "";
      this.renderList();
      this.renderPreview();
    });
    item.add(hit);
    return item;
  }

  private createCreateItem(x: number, y: number): Phaser.GameObjects.Container {
    const item = this.add.container(x, y);
    item.add(createRectangleButton(
      this,
      (LIST_W - 36) / 2,
      28,
      LIST_W - 36,
      56,
      t("settings.profiles.create"),
      () => {
        void createProfile(t("settings.profiles.newDefaultName")).then((profile) => {
          this.selectedProfileId = profile.id;
          this.statusMessage = "";
          this.renderList();
          this.renderPreview();
        });
      },
      { accent: 0x34d399 },
    ).container);
    return item;
  }

  private renderPreview(): void {
    this.previewLayer?.removeAll(true);
    const layer = this.previewLayer;
    if (!layer) return;
    const profile = getProfile(this.selectedProfileId);
    const profiles = listProfiles();
    const isFirstProfileSelected = profiles[0]?.id === profile.id;
    const frame = this.add.graphics();
    frame.fillStyle(0x101820, 0.92).fillRect(0, 0, 430, 470);
    frame.lineStyle(2, 0x34475c, 0.9).strokeRect(0, 0, 430, 470);
    layer.add(frame);
    layer.add(createRectangleButton(this, 112, 36, 176, 42, t("settings.profiles.import"), () => this.importProfileFile(), { accent: 0x8af7ff }).container);
    layer.add(createRectangleButton(this, 316, 36, 176, 42, t("settings.profiles.export"), () => this.exportSelectedProfile(), { accent: 0xffcf6e }).container);

    layer.add(this.add.text(28, 82, t("settings.profiles.username"), bodyStyle("#f6f1e6", 17)));
    let username = profile.username;
    const field = createTextField(this, 28, 112, 374, {
      value: username,
      maxLength: MAX_PLAYER_NAME_LENGTH,
      variant: "rect",
      onFocus: (focused) => {
        this.activeField?.setActive(false);
        this.activeField = focused;
      },
      onChange: (value) => {
        username = value;
      },
    });
    layer.add(field.container);

    layer.add(createRectangleButton(this, 215, 190, 250, 42, t("settings.profiles.editKeyboard"), () => this.openEditor("configure-keyboard"), { accent: 0x8af7ff }).container);
    layer.add(createRectangleButton(this, 215, 248, 250, 42, t("settings.profiles.editJoystick"), () => this.openEditor("configure-joystick"), { accent: 0x8af7ff }).container);
    layer.add(createRectangleButton(this, 215, 306, 250, 42, t("settings.profiles.editVirtualJoy"), () => {
      this.scene.start("configure-virtual-joy", { profileId: this.selectedProfileId });
    }, { accent: 0x8af7ff }).container);

    layer.add(createRectangleButton(this, 215, 376, 250, 42, t("settings.profiles.save"), () => {
      void saveProfile(profile.id, { username }).then((saved) => {
        this.selectedProfileId = saved.id;
        this.statusMessage = t("settings.profiles.saveSuccess");
        this.renderList();
        this.renderPreview();
      });
    }, { accent: 0x34d399 }).container);
    layer.add(createRectangleButton(
      this,
      215,
      430,
      250,
      42,
      t("settings.profiles.delete"),
      isFirstProfileSelected ? undefined : () => this.confirmDelete(profile),
      {
        accent: 0xff5c66,
        enabled: !isFirstProfileSelected,
      },
    ).container);
    this.statusText = this.add.text(28, 454, this.statusMessage, bodyStyle("#34d399", 14));
    layer.add(this.statusText);
  }

  private openEditor(sceneKey: "configure-keyboard" | "configure-joystick"): void {
    setEditingProfileId(this.selectedProfileId);
    this.scene.start(sceneKey);
  }

  private importProfileFile(): void {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json,application/json";
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;
      void file.text()
        .then(parseImportedProfile)
        .then(importProfile)
        .then((profile) => {
          this.selectedProfileId = profile.id;
          this.statusMessage = t("settings.profiles.importSuccess");
          this.renderList();
          this.renderPreview();
        })
        .catch(() => {
          this.statusMessage = t("settings.profiles.importInvalid");
          this.renderPreview();
        });
    };
    input.click();
  }

  private exportSelectedProfile(): void {
    const profile = getProfile(this.selectedProfileId);
    const blob = new Blob([serializeProfile(profile)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `fxtz-profile-${profile.username}-${shortProfileHash(profile)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  private confirmDelete(profile: LocalInputProfile): void {
    this.confirmDialog?.destroy();
    const dialog = this.add.container(0, 0).setDepth(20000);
    dialog.add(this.add.rectangle(640, 360, 1280, 720, 0x000000, 0.62).setInteractive());
    dialog.add(this.add.rectangle(640, 360, 460, 210, 0x101820, 0.98).setStrokeStyle(2, 0xff5c66, 1));
    dialog.add(this.add.text(640, 314, t("settings.profiles.deleteConfirm"), bodyStyle("#f6f1e6", 18)).setOrigin(0.5).setWordWrapWidth(380));
    dialog.add(createRectangleButton(this, 548, 400, 150, 42, t("dialog.cancel"), () => {
      dialog.destroy();
      this.confirmDialog = undefined;
    }, { accent: 0x5c7185 }).container);
    dialog.add(createRectangleButton(this, 732, 400, 150, 42, t("dialog.confirm"), () => {
      const nextSelectedProfileId = this.resolveSelectionAfterDelete(profile.id);
      void deleteProfile(profile.id).then(() => {
        this.selectedProfileId = nextSelectedProfileId;
        dialog.destroy();
        this.confirmDialog = undefined;
        this.renderList();
        this.renderPreview();
      });
    }, { accent: 0xff5c66 }).container);
    this.confirmDialog = dialog;
  }

  private resolveSelectionAfterDelete(deletedProfileId: string): string {
    const profiles = listProfiles();
    const deletedIndex = profiles.findIndex((profile) => profile.id === deletedProfileId);
    if (deletedIndex < 0) {
      return profiles[0]?.id ?? "default";
    }
    const nextProfile = profiles[deletedIndex + 1] ?? profiles[deletedIndex - 1];
    return nextProfile?.id ?? "default";
  }
}

function formatTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}
