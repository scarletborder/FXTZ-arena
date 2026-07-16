import Phaser from "phaser";
import { t } from "@repo/i18n";

import {
  bodyStyle,
  createFightButton,
  drawFightingBackdrop,
  headingStyle,
} from "./ui";
import type { SceneKey } from "./shared";
import { ARENA_HEIGHT_PX, ARENA_WIDTH_PX } from "@repo/constants";
import { createBattleLayout, type BattleLayout } from "../battle/view/layout";
import {
  resolveVirtualJoyAlpha,
  resolveVirtualJoyPosition,
  resolveVirtualJoySensitivity,
  resolveVirtualJoySize,
  toVirtualJoyPosition,
  VIRTUAL_JOY_CONTROL_IDS,
  type VirtualJoyControlId,
  type VirtualJoySettings,
} from "../battle/input-controller/virtual-joy-settings";
import { setVirtualJoySettings, settingsRepository } from "../store/settings";
import { getProfile, saveProfile } from "../store/profile-repository";

interface VirtualJoyHandle {
  readonly id: VirtualJoyControlId;
  readonly container: Phaser.GameObjects.Container;
  readonly ring: Phaser.GameObjects.Arc;
  readonly label: Phaser.GameObjects.Text;
  readonly hint: Phaser.GameObjects.Text;
  readonly hitArea: Phaser.GameObjects.Arc;
  readonly baseRadius: number;
}

type EditorMode = "size" | "alpha" | "sensitivity";

interface PendingTap {
  readonly pointerId: number;
  readonly handle: VirtualJoyHandle;
}

interface ActiveDrag {
  readonly pointerId: number;
  readonly offsetX: number;
  readonly offsetY: number;
}

interface EditorWidgets {
  readonly layer: Phaser.GameObjects.Container;
  readonly title: Phaser.GameObjects.Text;
  readonly subtitle: Phaser.GameObjects.Text;
  readonly track: Phaser.GameObjects.Rectangle;
  readonly fill: Phaser.GameObjects.Rectangle;
  readonly knob: Phaser.GameObjects.Arc;
  readonly value: Phaser.GameObjects.Text;
}

const HOLD_TO_DRAG_MS = 260;
const HANDLE_MARGIN = 18;
const EDGE_HANDLE_CENTER_MARGIN = 4;
const EDITOR_SCREEN_MARGIN = 16;
const EDITOR_SPACING = 116;
const EDITOR_PANEL_WIDTH = 260;
const EDITOR_PANEL_HEIGHT = 88;
const EDITOR_TRACK_WIDTH = 156;
const SIZE_RANGE: readonly [number, number] = [0.6, 1.8];
const ALPHA_RANGE: readonly [number, number] = [0.2, 1];
const SENSITIVITY_RANGE: readonly [number, number] = [0.4, 2];
const EDITOR_SAVE_DEBOUNCE_MS = 220;

export class ConfigureVirtualJoyScene extends Phaser.Scene {
  private controls: VirtualJoySettings = settingsRepository.get().virtualJoy;
  private profileId: string | undefined;
  private readonly handles: VirtualJoyHandle[] = [];
  private battleLayout!: BattleLayout;
  private activeDrag: ActiveDrag | null = null;
  private activeHandle: VirtualJoyHandle | null = null;
  private holdTimer: Phaser.Time.TimerEvent | null = null;
  private selectedHandle: VirtualJoyHandle | null = null;
  private sizeEditor: EditorWidgets | null = null;
  private alphaEditor: EditorWidgets | null = null;
  private sensitivityEditor: EditorWidgets | null = null;
  private editorPointer: { mode: EditorMode; pointerId: number } | null = null;
  private pendingTap: PendingTap | null = null;
  private editorSaveTimer: Phaser.Time.TimerEvent | null = null;

  constructor() {
    super("configure-virtual-joy" satisfies SceneKey);
  }

  init(data?: { readonly profileId?: string }): void {
    this.profileId = data?.profileId;
  }

  create(): void {
    this.controls = this.profileId ? getProfile(this.profileId).virtualJoy : settingsRepository.get().virtualJoy;
    this.handles.length = 0;
    this.battleLayout = createBattleLayout();

    this.scale.setGameSize(this.battleLayout.width, this.battleLayout.height);
    this.cameras.main.setSize(this.battleLayout.width, this.battleLayout.height);
    this.cameras.main.setScroll(0, 0);

    drawFightingBackdrop(this, "VIRTUAL", "JOYSTICK");
    this.drawOverlayTexts();
    this.drawFullScreenGuide();
    this.createBackControl();

    for (const id of VIRTUAL_JOY_CONTROL_IDS) {
      this.createHandle(id);
    }

    const onPointerMove = (pointer: Phaser.Input.Pointer): void => {
      if (pointer.id === this.activeDrag?.pointerId && this.activeHandle) {
        this.moveHandle(this.activeHandle, pointer.x - this.activeDrag.offsetX, pointer.y - this.activeDrag.offsetY);
        pointer.event?.preventDefault();
        return;
      }
      if (pointer.id === this.editorPointer?.pointerId) {
        this.updateEditorByPointer(this.editorPointer.mode, pointer.x);
        pointer.event?.preventDefault();
      }
    };
    const onPointerUp = (pointer: Phaser.Input.Pointer): void => {
      const tappedHandle = pointer.id === this.pendingTap?.pointerId ? this.pendingTap.handle : null;
      if (pointer.id === this.activeDrag?.pointerId || pointer.id === this.pendingTap?.pointerId) {
        this.finishDrag();
      }
      if (pointer.id === this.editorPointer?.pointerId) {
        this.editorPointer = null;
      }
      if (tappedHandle) {
        this.selectHandle(tappedHandle);
      }
    };

    this.input.on("pointermove", onPointerMove);
    this.input.on("pointerup", onPointerUp);
    this.input.on("pointerupoutside", onPointerUp);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.input.off("pointermove", onPointerMove);
      this.input.off("pointerup", onPointerUp);
      this.input.off("pointerupoutside", onPointerUp);
      this.holdTimer?.remove(false);
      this.flushEditorSettingsSave();
    });
  }

  private drawOverlayTexts(): void {
    const left = 48;
    const top = 36;
    this.add.text(left, top, t("settings.virtualJoy.configureTitle"), headingStyle(38));
    this.add.text(left, top + 46, t("settings.virtualJoy.autoSaveHint"), bodyStyle("#ffcf6e", 18));
    this.add.text(left, top + 78, t("settings.virtualJoy.dragHint"), bodyStyle("#b7c7d8", 15));
    this.add.text(left, top + 104, t("settings.virtualJoy.editHint"), bodyStyle("#9fd8ff", 15));
  }

  private drawFullScreenGuide(): void {
    const graphics = this.add.graphics();
    const left = 0;
    const top = 0;
    graphics.fillStyle(0x101820, 0.2).fillRect(left, top, this.battleLayout.width, this.battleLayout.height);
    graphics.lineStyle(2, 0x34475c, 0.85).strokeRect(left, top, this.battleLayout.width, this.battleLayout.height);
    graphics.lineStyle(1, 0x5c7185, 0.38);
    graphics.lineBetween(left + this.battleLayout.width / 2, top, left + this.battleLayout.width / 2, top + this.battleLayout.height);
    graphics.lineBetween(left, top + this.battleLayout.height / 2, left + this.battleLayout.width, top + this.battleLayout.height / 2);
    graphics.lineStyle(2, 0x6d8296, 0.66).strokeRect(
      this.battleLayout.arenaInsetX,
      this.battleLayout.arenaInsetY,
      ARENA_WIDTH_PX,
      ARENA_HEIGHT_PX,
    );
  }

  private createBackControl(): void {
    createFightButton(
      this,
      this.battleLayout.width / 2,
      this.battleLayout.arenaInsetY + 54,
      176,
      46,
      t("menu.back"),
      () => this.scene.start(this.profileId ? "profiles-manage" : "settings"),
      { accent: 0x5c7185 },
    );
  }

  private createHandle(id: VirtualJoyControlId): void {
    const position = resolveVirtualJoyPosition(this.controls, id, this.battleLayout);
    const size = resolveVirtualJoySize(this.controls, id);
    const alpha = resolveVirtualJoyAlpha(this.controls, id);
    const baseRadius = handleRadius(id);
    const radius = baseRadius * size;
    const container = this.add.container(position.x, position.y);
    const ring = this.add.circle(0, 0, radius, handleFill(id), 0.56 * alpha)
      .setStrokeStyle(Math.max(2, Math.round(3 * size)), handleAccent(id), 0.88 * alpha);
    const label = this.add.text(0, 0, controlLabel(id), {
      ...bodyStyle("#f6f1e6", Math.max(16, Math.round(radius * 0.34))),
      align: "center",
    }).setOrigin(0.5).setAlpha(alpha);
    const hint = this.add.text(0, radius + 18, t("settings.virtualJoy.hold"), bodyStyle("#9fd8ff", 13))
      .setOrigin(0.5)
      .setAlpha(alpha);
    const hitRadius = radius + HANDLE_MARGIN;
    const hitArea = this.add.circle(0, 0, hitRadius, 0xffffff, 0.001)
      .setInteractive(
        new Phaser.Geom.Circle(hitRadius, hitRadius, hitRadius),
        Phaser.Geom.Circle.Contains,
        true,
      );
    const handle: VirtualJoyHandle = {
      id,
      container,
      ring,
      label,
      hint,
      hitArea,
      baseRadius,
    };

    hitArea.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      this.startHold(handle, pointer);
      pointer.event?.preventDefault();
    });
    hitArea.on("pointerup", () => this.finishDrag());
    hitArea.on("pointerout", () => {
      if (!this.activeHandle) {
        this.cancelHold();
      }
    });

    container.add([ring, label, hint, hitArea]);
    this.handles.push(handle);
    this.refreshHandleView(handle);
  }

  private startHold(handle: VirtualJoyHandle, pointer: Phaser.Input.Pointer): void {
    if (this.activeDrag !== null || this.editorPointer !== null) {
      return;
    }
    this.cancelHold();
    this.pendingTap = { pointerId: pointer.id, handle };
    this.holdTimer = this.time.delayedCall(HOLD_TO_DRAG_MS, () => {
      this.activeDrag = {
        pointerId: pointer.id,
        offsetX: pointer.x - handle.container.x,
        offsetY: pointer.y - handle.container.y,
      };
      this.activeHandle = handle;
      this.pendingTap = null;
      this.selectHandle(handle);
      this.moveHandle(handle, pointer.x - this.activeDrag.offsetX, pointer.y - this.activeDrag.offsetY);
    });
  }

  private moveHandle(handle: VirtualJoyHandle, x: number, y: number): void {
    const bounds = this.dragBounds();
    const clampedX = Phaser.Math.Clamp(x, bounds.left, bounds.right);
    const clampedY = Phaser.Math.Clamp(y, bounds.top, bounds.bottom);
    handle.container.setPosition(clampedX, clampedY);
    this.controls = {
      ...this.controls,
      [handle.id]: {
        ...this.controls[handle.id],
        ...toVirtualJoyPosition(clampedX, clampedY, this.battleLayout),
      },
    };
    this.saveControls();
    this.updateEditorsForSelection();
  }

  private finishDrag(): void {
    const draggedHandle = this.activeHandle;
    this.cancelHold();
    if (draggedHandle) {
      this.selectHandle(draggedHandle);
    }
  }

  private cancelHold(): void {
    this.holdTimer?.remove(false);
    this.holdTimer = null;
    this.activeDrag = null;
    this.activeHandle = null;
    this.pendingTap = null;
  }

  private selectHandle(handle: VirtualJoyHandle): void {
    this.selectedHandle = handle;
    for (const candidate of this.handles) {
      candidate.container.setDepth(candidate === handle ? 12 : 8);
    }
    this.rebuildEditors(handle);
  }

  private rebuildEditors(handle: VirtualJoyHandle): void {
    this.sizeEditor?.layer.destroy(true);
    this.alphaEditor?.layer.destroy(true);
    this.sensitivityEditor?.layer.destroy(true);
    const anchor = this.resolveEditorAnchor(handle);
    this.sizeEditor = this.createEditor(anchor.x, anchor.y, "size");
    this.alphaEditor = this.createEditor(anchor.x, anchor.y + EDITOR_SPACING, "alpha");
    this.sensitivityEditor = isJoystickHandle(handle.id)
      ? this.createEditor(anchor.x, anchor.y + EDITOR_SPACING * 2, "sensitivity")
      : null;
    this.updateEditorsForSelection();
  }

  private createEditor(x: number, y: number, mode: EditorMode): EditorWidgets {
    const layer = this.add.container(x, y).setDepth(20);
    const panel = this.add.graphics();
    panel.fillStyle(0x0f1620, 0.94).fillRoundedRect(0, 0, EDITOR_PANEL_WIDTH, EDITOR_PANEL_HEIGHT, 8);
    panel.lineStyle(2, editorAccent(mode), 0.9).strokeRoundedRect(0, 0, EDITOR_PANEL_WIDTH, EDITOR_PANEL_HEIGHT, 8);
    const title = this.add.text(16, 12, t(editorTitleKey(mode)), bodyStyle("#f6f1e6", 14)).setOrigin(0, 0);
    const subtitle = this.add.text(16, 34, t("settings.virtualJoy.dragAdjust"), bodyStyle("#9fb4c8", 11)).setOrigin(0, 0);
    const track = this.add.rectangle(84, 64, EDITOR_TRACK_WIDTH, 10, 0x243547, 1).setOrigin(0, 0.5).setStrokeStyle(2, 0x5c7185, 0.75);
    const fill = this.add.rectangle(84, 64, 0, 10, 0x8af7ff, 0.88).setOrigin(0, 0.5);
    const knob = this.add.circle(84, 64, 13, 0xf6f1e6, 1).setStrokeStyle(3, editorAccent(mode), 0.85);
    const value = this.add.text(56, 64, "", bodyStyle("#ffcf6e", 13)).setOrigin(0.5, 0.5);
    const dragZone = this.add.rectangle(84 + EDITOR_TRACK_WIDTH / 2, 64, EDITOR_TRACK_WIDTH + 30, 42, 0xffffff, 0.001)
      .setInteractive({ useHandCursor: true });

    dragZone.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      this.editorPointer = { mode, pointerId: pointer.id };
      this.updateEditorByPointer(mode, pointer.x);
      pointer.event?.preventDefault();
    });

    layer.add([panel, title, subtitle, track, fill, knob, value, dragZone]);

    return {
      layer,
      title,
      subtitle,
      track,
      fill,
      knob,
      value,
    };
  }

  private updateEditorByPointer(mode: EditorMode, pointerX: number): void {
    if (!this.selectedHandle) {
      return;
    }
    const editor = mode === "size" ? this.sizeEditor : mode === "alpha" ? this.alphaEditor : this.sensitivityEditor;
    if (!editor) {
      return;
    }
    const left = editor.layer.x + 84;
    const right = left + EDITOR_TRACK_WIDTH;
    const normalized = Phaser.Math.Clamp((pointerX - left) / Math.max(1, right - left), 0, 1);
    const [min, max] = editorRange(mode);
    const value = Phaser.Math.Linear(min, max, normalized);
    this.controls = {
      ...this.controls,
      [this.selectedHandle.id]: {
        ...this.controls[this.selectedHandle.id],
        [mode]: value,
      },
    };
    this.scheduleEditorSettingsSave();
    this.refreshHandleView(this.selectedHandle);
    this.updateEditorsForSelection();
  }

  private scheduleEditorSettingsSave(): void {
    this.editorSaveTimer?.remove(false);
    this.editorSaveTimer = this.time.delayedCall(EDITOR_SAVE_DEBOUNCE_MS, () => {
      this.editorSaveTimer = null;
      this.saveControls();
    });
  }

  private flushEditorSettingsSave(): void {
    if (!this.editorSaveTimer) {
      return;
    }
    this.editorSaveTimer.remove(false);
    this.editorSaveTimer = null;
    this.saveControls();
  }

  private saveControls(): void {
    if (this.profileId) {
      void saveProfile(this.profileId, { virtualJoy: this.controls });
      return;
    }
    setVirtualJoySettings(this.controls);
  }

  private updateEditorsForSelection(): void {
    if (!this.selectedHandle) {
      return;
    }
    this.refreshHandleView(this.selectedHandle);
    this.updateEditorWidgets("size", resolveVirtualJoySize(this.controls, this.selectedHandle.id));
    this.updateEditorWidgets("alpha", resolveVirtualJoyAlpha(this.controls, this.selectedHandle.id));
    if (isJoystickHandle(this.selectedHandle.id)) {
      this.updateEditorWidgets("sensitivity", resolveVirtualJoySensitivity(this.controls, this.selectedHandle.id));
    }
  }

  private updateEditorWidgets(mode: EditorMode, currentValue: number): void {
    const editor = mode === "size" ? this.sizeEditor : mode === "alpha" ? this.alphaEditor : this.sensitivityEditor;
    if (!editor) {
      return;
    }
    const [min, max] = editorRange(mode);
    const ratio = Phaser.Math.Clamp((currentValue - min) / (max - min), 0, 1);
    const fillWidth = Math.max(1, ratio * EDITOR_TRACK_WIDTH);
    editor.knob.setPosition(84 + fillWidth, 64);
    editor.fill.setPosition(84, 64).setDisplaySize(fillWidth, 10);
    editor.fill.setFillStyle(editorAccent(mode), 0.88);
    editor.value.setText(mode === "alpha" ? `${Math.round(currentValue * 100)}%` : `${currentValue.toFixed(2)}x`);
  }

  private refreshHandleView(handle: VirtualJoyHandle): void {
    const size = resolveVirtualJoySize(this.controls, handle.id);
    const alpha = resolveVirtualJoyAlpha(this.controls, handle.id);
    const radius = handle.baseRadius * size;
    handle.ring.setRadius(radius);
    handle.ring.setFillStyle(handleFill(handle.id), 0.56 * alpha);
    handle.ring.setStrokeStyle(Math.max(2, Math.round(3 * size)), handleAccent(handle.id), 0.88 * alpha);
    handle.label.setStyle(bodyStyle("#f6f1e6", Math.max(16, Math.round(radius * 0.34))));
    handle.label.setAlpha(alpha);
    handle.hint.setPosition(0, radius + 18).setAlpha(alpha);
    handle.hitArea.setRadius(radius + HANDLE_MARGIN);
    updateCircleHitArea(handle.hitArea, radius + HANDLE_MARGIN);
    const position = resolveVirtualJoyPosition(this.controls, handle.id, this.battleLayout);
    handle.container.setPosition(position.x, position.y);
  }

  private resolveEditorAnchor(handle: VirtualJoyHandle): { readonly x: number; readonly y: number } {
    const bounds = this.editorBounds();
    const x =
      handle.container.x <= this.battleLayout.width / 2
        ? Math.min(bounds.right - EDITOR_PANEL_WIDTH, handle.container.x + handle.baseRadius * resolveVirtualJoySize(this.controls, handle.id) + 34)
        : Math.max(bounds.left, handle.container.x - handle.baseRadius * resolveVirtualJoySize(this.controls, handle.id) - EDITOR_PANEL_WIDTH - 34);
    const editorCount = isJoystickHandle(handle.id) ? 3 : 2;
    const y = Phaser.Math.Clamp(handle.container.y - EDITOR_PANEL_HEIGHT / 2, bounds.top, bounds.bottom - EDITOR_SPACING * (editorCount - 1) - EDITOR_PANEL_HEIGHT);
    return { x, y };
  }

  private dragBounds(): {
    readonly left: number;
    readonly right: number;
    readonly top: number;
    readonly bottom: number;
  } {
    return {
      left: EDGE_HANDLE_CENTER_MARGIN,
      right: this.battleLayout.width - EDGE_HANDLE_CENTER_MARGIN,
      top: EDGE_HANDLE_CENTER_MARGIN,
      bottom: this.battleLayout.height - EDGE_HANDLE_CENTER_MARGIN,
    };
  }

  private editorBounds(): {
    readonly left: number;
    readonly right: number;
    readonly top: number;
    readonly bottom: number;
  } {
    return {
      left: EDITOR_SCREEN_MARGIN,
      right: this.battleLayout.width - EDITOR_SCREEN_MARGIN,
      top: EDITOR_SCREEN_MARGIN,
      bottom: this.battleLayout.height - EDITOR_SCREEN_MARGIN,
    };
  }
}

function controlLabel(id: VirtualJoyControlId): string {
  return {
    moveJoystick: t("settings.virtualJoy.moveJoystick"),
    aimJoystick: t("settings.virtualJoy.aimJoystick"),
    pause: t("battle.mobile_pause"),
    switch: t("battle.mobile_switch"),
    reload: t("battle.mobile_reload"),
    activeCard: t("battle.mobile_card"),
    bomb: t("battle.mobile_bomb"),
    shoot: t("battle.mobile_shoot"),
  }[id];
}

function handleRadius(id: VirtualJoyControlId): number {
  return {
    moveJoystick: 74,
    aimJoystick: 88,
    pause: 36,
    switch: 42,
    reload: 54,
    activeCard: 44,
    bomb: 46,
    shoot: 58,
  }[id];
}

function handleFill(id: VirtualJoyControlId): number {
  return {
    moveJoystick: 0x102232,
    aimJoystick: 0x19293b,
    pause: 0x283446,
    switch: 0x26384c,
    reload: 0x253346,
    activeCard: 0x233f3f,
    bomb: 0x382d4f,
    shoot: 0x4b2734,
  }[id];
}

function handleAccent(id: VirtualJoyControlId): number {
  return {
    moveJoystick: 0x8af7ff,
    aimJoystick: 0x8af7ff,
    pause: 0xffcf6e,
    switch: 0xffcf6e,
    reload: 0x8af7ff,
    activeCard: 0x70f0c8,
    bomb: 0xc8a7ff,
    shoot: 0xff6b8a,
  }[id];
}

function isJoystickHandle(id: VirtualJoyControlId): id is "moveJoystick" | "aimJoystick" {
  return id === "moveJoystick" || id === "aimJoystick";
}

function editorRange(mode: EditorMode): readonly [number, number] {
  if (mode === "size") return SIZE_RANGE;
  if (mode === "alpha") return ALPHA_RANGE;
  return SENSITIVITY_RANGE;
}

function editorAccent(mode: EditorMode): number {
  if (mode === "size") return 0x8af7ff;
  if (mode === "alpha") return 0xffcf6e;
  return 0x70f0c8;
}

function editorTitleKey(mode: EditorMode): string {
  if (mode === "size") return "settings.virtualJoy.size";
  if (mode === "alpha") return "settings.virtualJoy.alpha";
  return "settings.virtualJoy.sensitivity";
}

function updateCircleHitArea(object: Phaser.GameObjects.Arc, radius: number): void {
  const input = object.input;
  if (!input) {
    return;
  }
  input.hitArea = new Phaser.Geom.Circle(radius, radius, radius);
  input.hitAreaCallback = Phaser.Geom.Circle.Contains;
}
