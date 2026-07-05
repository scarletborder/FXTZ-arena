import Phaser from "phaser";
import { t } from "@repo/i18n";

import { ARENA_HEIGHT_PX, ARENA_WIDTH_PX } from "@repo/constants";
import { Depth } from "../../utils/depth";
import { settingsRepository } from "../../store/settings";
import {
  resolveVirtualJoyAlpha,
  resolveVirtualJoyPosition,
  resolveVirtualJoySize,
  type VirtualJoyControlId,
  type VirtualJoySettings,
} from "./virtual-joy-settings";

type ActionButton = "shoot" | "bomb" | "activeCard" | "reload" | "switch";

interface ButtonConfig {
  readonly id: VirtualJoyControlId;
  readonly action: ActionButton;
  readonly x: number;
  readonly y: number;
  readonly radius: number;
  readonly label: string;
  readonly fill: number;
  readonly accent: number;
  readonly alpha: number;
}

interface BattleMobileControlsState {
  readonly moveX: -1 | 0 | 1;
  readonly moveY: -1 | 0 | 1;
  readonly aimX: number;
  readonly aimY: number;
  readonly shootPressed: boolean;
  readonly bombPressed: boolean;
  readonly activeCardPressed: boolean;
  readonly reloadPressed: boolean;
  readonly alternateHeld: boolean;
}

interface BattleMobileControlsLayout {
  readonly width: number;
  readonly height: number;
}

const JOYSTICK_RADIUS = 74;
const JOYSTICK_KNOB_RADIUS = 26;
const JOYSTICK_DEAD_ZONE = 16;
const JOYSTICK_FOLLOW_LIMIT = 108;
const AIM_JOYSTICK_RADIUS = 88;
const AIM_KNOB_RADIUS = 30;
const AIM_START_DISTANCE = 34;
const AIM_SPEED_PX_PER_TICK = 8;
const AIM_FOLLOW_LIMIT = 118;

export function shouldEnableMobileBattleControls(scene: Phaser.Scene): boolean {
  const touchSupported =
    scene.sys.game.device.input.touch ||
    navigator.maxTouchPoints > 0 ||
    "ontouchstart" in window;
  const coarsePointer =
    window.matchMedia?.("(pointer: coarse)").matches ?? false;
  const hoverless = window.matchMedia?.("(hover: none)").matches ?? false;
  return touchSupported && coarsePointer && hoverless;
}

export class BattleMobileControls {
  private readonly scene: Phaser.Scene;
  private readonly disposables: Array<() => void> = [];
  private readonly displayObjects: Phaser.GameObjects.GameObject[] = [];
  private readonly heldButtons = new Set<ActionButton>();
  private readonly consumedButtons = new Set<ActionButton>();
  private joystickPointerId: number | null = null;
  private readonly joystickOrigin = new Phaser.Math.Vector2(0, 0);
  private readonly joystickBase = new Phaser.Math.Vector2(0, 0);
  private readonly joystickKnob = new Phaser.Math.Vector2(0, 0);
  private readonly aimOrigin = new Phaser.Math.Vector2(0, 0);
  private readonly aimRest = new Phaser.Math.Vector2(0, 0);
  private readonly aimBase = new Phaser.Math.Vector2(0, 0);
  private readonly aimKnob = new Phaser.Math.Vector2(0, 0);
  private readonly aimVector = new Phaser.Math.Vector2(0, 0);
  private aimPointerId: number | null = null;
  private moveX: -1 | 0 | 1 = 0;
  private moveY: -1 | 0 | 1 = 0;
  private aimX = ARENA_WIDTH_PX / 2;
  private aimY = ARENA_HEIGHT_PX / 2;
  private alternateHeld = false;
  private readonly layout: BattleMobileControlsLayout;
  private readonly joystickBaseView: Phaser.GameObjects.Arc;
  private readonly joystickKnobView: Phaser.GameObjects.Arc;
  private aimBaseView!: Phaser.GameObjects.Arc;
  private aimKnobView!: Phaser.GameObjects.Arc;
  private readonly virtualJoySettings: VirtualJoySettings;
  private readonly moveJoystickScale: number;
  private readonly moveJoystickAlpha: number;

  constructor(scene: Phaser.Scene, layout?: BattleMobileControlsLayout) {
    this.scene = scene;
    this.layout = layout ?? {
      width: scene.scale.width,
      height: scene.scale.height,
    };
    this.virtualJoySettings = settingsRepository.get().virtualJoy;
    this.moveJoystickScale = resolveVirtualJoySize(this.virtualJoySettings, "moveJoystick");
    this.moveJoystickAlpha = resolveVirtualJoyAlpha(this.virtualJoySettings, "moveJoystick");
    this.scene.input.addPointer(6);

    this.joystickBaseView = scene.add
      .circle(0, 0, JOYSTICK_RADIUS * this.moveJoystickScale, 0x102232, 0.34 * this.moveJoystickAlpha)
      .setStrokeStyle(Math.max(2, Math.round(3 * this.moveJoystickScale)), 0x8af7ff, 0.7 * this.moveJoystickAlpha)
      .setScrollFactor(0)
      .setDepth(Depth.MobileControls)
      .setVisible(false);
    this.joystickKnobView = scene.add
      .circle(0, 0, JOYSTICK_KNOB_RADIUS * this.moveJoystickScale, 0x8af7ff, 0.62 * this.moveJoystickAlpha)
      .setStrokeStyle(Math.max(2, Math.round(2 * this.moveJoystickScale)), 0xf6f1e6, 0.7 * this.moveJoystickAlpha)
      .setScrollFactor(0)
      .setDepth(Depth.MobileControls + 1)
      .setVisible(false);
    this.displayObjects.push(this.joystickBaseView, this.joystickKnobView);
    const movePosition = this.controlPosition("moveJoystick");
    this.joystickOrigin.set(movePosition.x, movePosition.y);
    this.joystickBase.set(movePosition.x, movePosition.y);
    this.joystickKnob.set(movePosition.x, movePosition.y);
    this.renderMoveJoystick(true);

    const aimPosition = this.controlPosition("aimJoystick");
    this.createAimJoystick(aimPosition.x, aimPosition.y);
    for (const config of buttonConfigs(this.layout, this.virtualJoySettings)) {
      this.createButton(config);
    }

    this.bindMoveJoystick();
  }

  readState(): BattleMobileControlsState {
    this.advanceAim();
    return {
      moveX: this.moveX,
      moveY: this.moveY,
      aimX: Math.trunc(this.aimX),
      aimY: Math.trunc(this.aimY),
      shootPressed: this.heldButtons.has("shoot"),
      bombPressed: this.consumeButton("bomb"),
      activeCardPressed: this.consumeButton("activeCard"),
      reloadPressed: this.heldButtons.has("reload"),
      alternateHeld: this.alternateHeld,
    };
  }

  aimWorld(): { readonly x: number; readonly y: number } {
    return {
      x: Math.trunc(this.aimX),
      y: Math.trunc(this.aimY),
    };
  }

  destroy(): void {
    for (const dispose of this.disposables) {
      dispose();
    }
    this.disposables.length = 0;
    for (const object of this.displayObjects) {
      object.destroy();
    }
    this.displayObjects.length = 0;
    this.heldButtons.clear();
    this.consumedButtons.clear();
  }

  private bindMoveJoystick(): void {
    const onPointerDown = (pointer: Phaser.Input.Pointer): void => {
      if (this.tryStartMoveJoystick(pointer) || this.tryStartAimJoystick(pointer)) {
        pointer.event?.preventDefault();
      }
    };
    const onPointerMove = (pointer: Phaser.Input.Pointer): void => {
      if (pointer.id === this.joystickPointerId) {
        this.updateMoveJoystick(pointer);
        pointer.event?.preventDefault();
      }
      if (pointer.id === this.aimPointerId) {
        this.updateAimJoystick(pointer);
        pointer.event?.preventDefault();
      }
    };
    const onPointerUp = (pointer: Phaser.Input.Pointer): void => {
      if (pointer.id === this.joystickPointerId) {
        this.stopMoveJoystick();
      }
      if (pointer.id === this.aimPointerId) {
        this.stopAimJoystick();
      }
    };

    this.scene.input.on("pointerdown", onPointerDown);
    this.scene.input.on("pointermove", onPointerMove);
    this.scene.input.on("pointerup", onPointerUp);
    this.scene.input.on("pointerupoutside", onPointerUp);
    this.disposables.push(() => {
      this.scene.input.off("pointerdown", onPointerDown);
      this.scene.input.off("pointermove", onPointerMove);
      this.scene.input.off("pointerup", onPointerUp);
      this.scene.input.off("pointerupoutside", onPointerUp);
    });
  }

  private tryStartMoveJoystick(pointer: Phaser.Input.Pointer): boolean {
    if (
      this.joystickPointerId !== null ||
      pointer.x > this.layout.width * 0.5
    ) {
      return false;
    }
    this.joystickPointerId = pointer.id;
    this.joystickOrigin.set(pointer.x, pointer.y);
    this.joystickBase.set(pointer.x, pointer.y);
    this.joystickKnob.set(pointer.x, pointer.y);
    this.moveX = 0;
    this.moveY = 0;
    this.renderMoveJoystick(true);
    return true;
  }

  private updateMoveJoystick(pointer: Phaser.Input.Pointer): void {
    this.updateFollowBase(
      this.joystickOrigin,
      this.joystickBase,
      pointer,
      JOYSTICK_RADIUS,
      JOYSTICK_FOLLOW_LIMIT,
    );
    clampPointToCircle(pointer, this.joystickBase, JOYSTICK_RADIUS, this.joystickKnob);
    this.moveX = axisToDigital(this.joystickKnob.x - this.joystickBase.x);
    this.moveY = axisToDigital(this.joystickKnob.y - this.joystickBase.y);
    this.renderMoveJoystick(true);
  }

  private stopMoveJoystick(): void {
    this.joystickPointerId = null;
    this.moveX = 0;
    this.moveY = 0;
    const restPosition = this.controlPosition("moveJoystick");
    this.joystickOrigin.set(restPosition.x, restPosition.y);
    this.joystickBase.set(restPosition.x, restPosition.y);
    this.joystickKnob.set(restPosition.x, restPosition.y);
    this.renderMoveJoystick(true);
  }

  private renderMoveJoystick(visible: boolean): void {
    this.joystickBaseView
      .setPosition(this.joystickBase.x, this.joystickBase.y)
      .setVisible(visible);
    this.joystickKnobView
      .setPosition(this.joystickKnob.x, this.joystickKnob.y)
      .setVisible(visible);
  }

  private createAimJoystick(x: number, y: number): void {
    const size = resolveVirtualJoySize(this.virtualJoySettings, "aimJoystick");
    const alpha = resolveVirtualJoyAlpha(this.virtualJoySettings, "aimJoystick");
    const baseRadius = AIM_JOYSTICK_RADIUS * size;
    const knobRadius = AIM_KNOB_RADIUS * size;
    this.aimRest.set(x, y);
    this.aimOrigin.set(x, y);
    this.aimBase.set(x, y);
    this.aimKnob.set(x, y);
    this.aimBaseView = this.scene.add
      .circle(x, y, baseRadius, 0x19293b, 0.42 * alpha)
      .setStrokeStyle(Math.max(2, Math.round(4 * size)), 0x8af7ff, 0.72 * alpha)
      .setScrollFactor(0)
      .setDepth(Depth.MobileControls);
    this.aimKnobView = this.scene.add
      .circle(x, y, knobRadius, 0xf6f1e6, 0.28 * alpha)
      .setStrokeStyle(Math.max(2, Math.round(3 * size)), 0x8af7ff, 0.8 * alpha)
      .setScrollFactor(0)
      .setDepth(Depth.MobileControls + 1);
    const label = this.scene.add
      .text(x, y - baseRadius - 24, t("battle.mobile_aim"), {
        fontFamily: "Arial",
        fontSize: `${Math.max(18, Math.round(22 * size))}px`,
        color: "#f6f1e6",
      })
      .setOrigin(0.5)
      .setAlpha(alpha)
      .setScrollFactor(0)
      .setDepth(Depth.MobileControls + 2);
    this.displayObjects.push(this.aimBaseView, this.aimKnobView, label);
  }

  private tryStartAimJoystick(pointer: Phaser.Input.Pointer): boolean {
    if (
      this.aimPointerId !== null ||
      pointer.x < this.layout.width * 0.5 ||
      pointer.y < this.layout.height * 0.34
    ) {
      return false;
    }
    this.aimPointerId = pointer.id;
    this.aimOrigin.set(pointer.x, pointer.y);
    this.aimBase.set(pointer.x, pointer.y);
    this.aimKnob.set(pointer.x, pointer.y);
    this.aimVector.set(0, 0);
    this.renderAimJoystick();
    return true;
  }

  private updateAimJoystick(pointer: Phaser.Input.Pointer): void {
    this.updateFollowBase(
      this.aimOrigin,
      this.aimBase,
      pointer,
      AIM_JOYSTICK_RADIUS,
      AIM_FOLLOW_LIMIT,
    );
    const dx = pointer.x - this.aimBase.x;
    const dy = pointer.y - this.aimBase.y;
    const distance = Math.hypot(dx, dy);
    if (distance <= AIM_START_DISTANCE) {
      this.aimKnob.set(this.aimBase.x, this.aimBase.y);
      this.aimVector.set(0, 0);
      this.renderAimJoystick();
      return;
    }
    const angle = Math.atan2(dy, dx);
    const clampedDistance = Math.min(
      distance - AIM_START_DISTANCE,
      AIM_JOYSTICK_RADIUS - AIM_START_DISTANCE,
    );
    this.aimKnob.set(
      this.aimBase.x + Math.cos(angle) * clampedDistance,
      this.aimBase.y + Math.sin(angle) * clampedDistance,
    );
    this.aimVector.set(Math.cos(angle), Math.sin(angle));
    this.renderAimJoystick();
  }

  private stopAimJoystick(): void {
    this.aimPointerId = null;
    this.aimOrigin.copy(this.aimRest);
    this.aimBase.copy(this.aimRest);
    this.aimKnob.copy(this.aimRest);
    this.aimVector.set(0, 0);
    this.renderAimJoystick();
  }

  private renderAimJoystick(): void {
    this.aimBaseView.setPosition(this.aimBase.x, this.aimBase.y);
    this.aimKnobView.setPosition(this.aimKnob.x, this.aimKnob.y);
  }

  private advanceAim(): void {
    if (this.aimVector.lengthSq() === 0) {
      return;
    }
    this.aimX = Phaser.Math.Clamp(
      this.aimX + this.aimVector.x * AIM_SPEED_PX_PER_TICK,
      0,
      ARENA_WIDTH_PX,
    );
    this.aimY = Phaser.Math.Clamp(
      this.aimY + this.aimVector.y * AIM_SPEED_PX_PER_TICK,
      0,
      ARENA_HEIGHT_PX,
    );
  }

  private createButton(config: ButtonConfig): void {
    const ring = this.scene.add
      .circle(config.x, config.y, config.radius, config.fill, 0.44 * config.alpha)
      .setStrokeStyle(Math.max(2, Math.round(3 * (config.radius / 58))), config.accent, 0.76 * config.alpha)
      .setScrollFactor(0)
      .setDepth(Depth.MobileControls);
    const gloss = this.scene.add
      .circle(
        config.x - config.radius * 0.26,
        config.y - config.radius * 0.28,
        config.radius * 0.28,
        0xffffff,
        0.12 * config.alpha,
      )
      .setScrollFactor(0)
      .setDepth(Depth.MobileControls + 1);
    const label = this.scene.add
      .text(config.x, config.y, config.label, {
        fontFamily: "Arial",
        fontSize: `${Math.max(17, Math.round(config.radius * 0.38))}px`,
        color: "#f6f1e6",
        align: "center",
      })
      .setOrigin(0.5)
      .setAlpha(config.alpha)
      .setScrollFactor(0)
      .setDepth(Depth.MobileControls + 2);
    const hitArea = this.scene.add
      .zone(config.x, config.y, config.radius * 2, config.radius * 2)
      .setInteractive(
        new Phaser.Geom.Circle(config.radius, config.radius, config.radius),
        Phaser.Geom.Circle.Contains,
      )
      .setScrollFactor(0)
      .setDepth(Depth.MobileControls + 3);

    const press = (
      pointer: Phaser.Input.Pointer,
      _localX: number,
      _localY: number,
      event: Phaser.Types.Input.EventData,
    ): void => {
      event.stopPropagation();
      this.pressButton(config.action);
      this.tintButton(ring, gloss, true);
      pointer.event?.preventDefault();
    };
    const release = (
      _pointer: Phaser.Input.Pointer,
      _localX: number,
      _localY: number,
      event: Phaser.Types.Input.EventData,
    ): void => {
      event.stopPropagation();
      this.releaseButton(config.action);
      this.tintButton(ring, gloss, false);
    };
    const releaseOutside = (): void => {
      this.releaseButton(config.action);
      this.tintButton(ring, gloss, false);
    };

    hitArea.on("pointerdown", press);
    hitArea.on("pointerup", release);
    hitArea.on("pointerout", releaseOutside);
    this.disposables.push(() => {
      hitArea.off("pointerdown", press);
      hitArea.off("pointerup", release);
      hitArea.off("pointerout", releaseOutside);
    });
    this.displayObjects.push(ring, gloss, label, hitArea);
  }

  private pressButton(action: ActionButton): void {
    if (action === "switch") {
      this.alternateHeld = !this.alternateHeld;
      return;
    }
    this.heldButtons.add(action);
  }

  private releaseButton(action: ActionButton): void {
    if (action === "switch") {
      return;
    }
    this.consumedButtons.delete(action);
    this.heldButtons.delete(action);
  }

  private consumeButton(action: ActionButton): boolean {
    if (!this.heldButtons.has(action) || this.consumedButtons.has(action)) {
      return false;
    }
    this.consumedButtons.add(action);
    return true;
  }

  private tintButton(
    ring: Phaser.GameObjects.Arc,
    gloss: Phaser.GameObjects.Arc,
    pressed: boolean,
  ): void {
    const baseAlpha = ring.fillAlpha <= 0 ? 1 : Math.min(1, ring.fillAlpha / 0.44);
    ring.setAlpha(pressed ? Math.min(1, baseAlpha * 1.35) : 1);
    gloss.setAlpha(pressed ? Math.min(1, 0.2 * baseAlpha) : Math.min(1, 0.12 * baseAlpha));
  }

  private controlPosition(control: VirtualJoyControlId): { readonly x: number; readonly y: number } {
    return resolveVirtualJoyPosition(this.virtualJoySettings, control, this.layout);
  }

  private updateFollowBase(
    origin: Phaser.Math.Vector2,
    base: Phaser.Math.Vector2,
    pointer: Phaser.Input.Pointer,
    knobRadius: number,
    followLimit: number,
  ): void {
    const dx = pointer.x - base.x;
    const dy = pointer.y - base.y;
    const pointerDistance = Math.hypot(dx, dy);
    if (pointerDistance > knobRadius) {
      const overshoot = pointerDistance - knobRadius;
      const originDx = pointer.x - origin.x;
      const originDy = pointer.y - origin.y;
      const originDistance = Math.hypot(originDx, originDy);
      const baseTravel = Math.min(overshoot, followLimit);
      if (originDistance > 0) {
        base.set(
          origin.x + (originDx / originDistance) * baseTravel,
          origin.y + (originDy / originDistance) * baseTravel,
        );
        return;
      }
    }
    base.copy(origin);
  }
}

function buttonConfigs(
  layout: BattleMobileControlsLayout,
  settings: VirtualJoySettings,
): ButtonConfig[] {
  return [
    {
      id: "switch",
      action: "switch",
      ...resolveVirtualJoyPosition(settings, "switch", layout),
      radius: 42 * resolveVirtualJoySize(settings, "switch"),
      label: t("battle.mobile_switch"),
      fill: 0x26384c,
      accent: 0xffcf6e,
      alpha: resolveVirtualJoyAlpha(settings, "switch"),
    },
    {
      id: "reload",
      action: "reload",
      ...resolveVirtualJoyPosition(settings, "reload", layout),
      radius: 54 * resolveVirtualJoySize(settings, "reload"),
      label: t("battle.mobile_reload"),
      fill: 0x253346,
      accent: 0x8af7ff,
      alpha: resolveVirtualJoyAlpha(settings, "reload"),
    },
    {
      id: "activeCard",
      action: "activeCard",
      ...resolveVirtualJoyPosition(settings, "activeCard", layout),
      radius: 44 * resolveVirtualJoySize(settings, "activeCard"),
      label: t("battle.mobile_card"),
      fill: 0x233f3f,
      accent: 0x70f0c8,
      alpha: resolveVirtualJoyAlpha(settings, "activeCard"),
    },
    {
      id: "bomb",
      action: "bomb",
      ...resolveVirtualJoyPosition(settings, "bomb", layout),
      radius: 46 * resolveVirtualJoySize(settings, "bomb"),
      label: t("battle.mobile_bomb"),
      fill: 0x382d4f,
      accent: 0xc8a7ff,
      alpha: resolveVirtualJoyAlpha(settings, "bomb"),
    },
    {
      id: "shoot",
      action: "shoot",
      ...resolveVirtualJoyPosition(settings, "shoot", layout),
      radius: 58 * resolveVirtualJoySize(settings, "shoot"),
      label: t("battle.mobile_shoot"),
      fill: 0x4b2734,
      accent: 0xff6b8a,
      alpha: resolveVirtualJoyAlpha(settings, "shoot"),
    },
  ];
}

function axisToDigital(value: number): -1 | 0 | 1 {
  if (value > JOYSTICK_DEAD_ZONE) return 1;
  if (value < -JOYSTICK_DEAD_ZONE) return -1;
  return 0;
}

function clampPointToCircle(
  pointer: Phaser.Input.Pointer,
  center: Phaser.Math.Vector2,
  radius: number,
  target: Phaser.Math.Vector2,
): void {
  const dx = pointer.x - center.x;
  const dy = pointer.y - center.y;
  const distance = Math.hypot(dx, dy);
  if (distance <= radius || distance === 0) {
    target.set(pointer.x, pointer.y);
    return;
  }
  target.set(
    center.x + (dx / distance) * radius,
    center.y + (dy / distance) * radius,
  );
}
