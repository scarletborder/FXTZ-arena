import Phaser from "phaser";
import { t } from "@repo/i18n";

import { ARENA_HEIGHT_PX, ARENA_WIDTH_PX } from "@repo/constants";
import { Depth } from "../../utils/depth";

type ActionButton = "shoot" | "bomb" | "activeCard" | "reload" | "switch";

interface ButtonConfig {
  readonly action: ActionButton;
  readonly x: number;
  readonly y: number;
  readonly radius: number;
  readonly label: string;
  readonly fill: number;
  readonly accent: number;
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
const JOYSTICK_DEAD_ZONE = 16;
const AIM_JOYSTICK_RADIUS = 88;
const AIM_KNOB_RADIUS = 30;
const AIM_START_DISTANCE = 34;
const AIM_SPEED_PX_PER_TICK = 13;

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
  private readonly joystickBase = new Phaser.Math.Vector2(0, 0);
  private readonly joystickKnob = new Phaser.Math.Vector2(0, 0);
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
  private aimKnobView!: Phaser.GameObjects.Arc;

  constructor(scene: Phaser.Scene, layout?: BattleMobileControlsLayout) {
    this.scene = scene;
    this.layout = layout ?? {
      width: scene.scale.width,
      height: scene.scale.height,
    };
    this.scene.input.addPointer(6);

    this.joystickBaseView = scene.add
      .circle(0, 0, JOYSTICK_RADIUS, 0x102232, 0.34)
      .setStrokeStyle(3, 0x8af7ff, 0.7)
      .setScrollFactor(0)
      .setDepth(Depth.MobileControls)
      .setVisible(false);
    this.joystickKnobView = scene.add
      .circle(0, 0, 26, 0x8af7ff, 0.62)
      .setStrokeStyle(2, 0xf6f1e6, 0.7)
      .setScrollFactor(0)
      .setDepth(Depth.MobileControls + 1)
      .setVisible(false);
    this.displayObjects.push(this.joystickBaseView, this.joystickKnobView);

    this.createAimJoystick(this.layout.width - 112, this.layout.height * 0.5);
    for (const config of buttonConfigs(this.layout)) {
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
      if (this.tryStartMoveJoystick(pointer)) {
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
    this.joystickBase.set(pointer.x, pointer.y);
    this.joystickKnob.set(pointer.x, pointer.y);
    this.moveX = 0;
    this.moveY = 0;
    this.renderMoveJoystick(true);
    return true;
  }

  private updateMoveJoystick(pointer: Phaser.Input.Pointer): void {
    const dx = pointer.x - this.joystickBase.x;
    const dy = pointer.y - this.joystickBase.y;
    const distance = Math.hypot(dx, dy);
    if (distance > JOYSTICK_RADIUS) {
      const angle = Math.atan2(dy, dx);
      this.joystickBase.set(
        pointer.x - Math.cos(angle) * JOYSTICK_RADIUS,
        pointer.y - Math.sin(angle) * JOYSTICK_RADIUS,
      );
    }
    this.joystickKnob.set(pointer.x, pointer.y);
    this.moveX = axisToDigital(this.joystickKnob.x - this.joystickBase.x);
    this.moveY = axisToDigital(this.joystickKnob.y - this.joystickBase.y);
    this.renderMoveJoystick(true);
  }

  private stopMoveJoystick(): void {
    this.joystickPointerId = null;
    this.moveX = 0;
    this.moveY = 0;
    this.renderMoveJoystick(false);
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
    this.aimBase.set(x, y);
    this.aimKnob.set(x, y);
    const base = this.scene.add
      .circle(x, y, AIM_JOYSTICK_RADIUS, 0x19293b, 0.42)
      .setStrokeStyle(4, 0x8af7ff, 0.72)
      .setScrollFactor(0)
      .setDepth(Depth.MobileControls);
    this.aimKnobView = this.scene.add
      .circle(x, y, AIM_KNOB_RADIUS, 0xf6f1e6, 0.28)
      .setStrokeStyle(3, 0x8af7ff, 0.8)
      .setScrollFactor(0)
      .setDepth(Depth.MobileControls + 1);
    const label = this.scene.add
      .text(x, y + AIM_JOYSTICK_RADIUS + 24, t("battle.mobile_aim"), {
        fontFamily: "Arial",
        fontSize: "22px",
        color: "#f6f1e6",
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(Depth.MobileControls + 2);
    const hitArea = this.scene.add
      .zone(x, y, AIM_JOYSTICK_RADIUS * 2, AIM_JOYSTICK_RADIUS * 2)
      .setInteractive(
        new Phaser.Geom.Circle(
          AIM_JOYSTICK_RADIUS,
          AIM_JOYSTICK_RADIUS,
          AIM_JOYSTICK_RADIUS,
        ),
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
      this.aimPointerId = pointer.id;
      this.updateAimJoystick(pointer);
      pointer.event?.preventDefault();
    };
    const release = (
      pointer: Phaser.Input.Pointer,
      _localX: number,
      _localY: number,
      event: Phaser.Types.Input.EventData,
    ): void => {
      event.stopPropagation();
      if (pointer.id === this.aimPointerId) {
        this.stopAimJoystick();
      }
    };

    hitArea.on("pointerdown", press);
    hitArea.on("pointerup", release);
    this.disposables.push(() => {
      hitArea.off("pointerdown", press);
      hitArea.off("pointerup", release);
    });
    this.displayObjects.push(base, this.aimKnobView, label, hitArea);
  }

  private updateAimJoystick(pointer: Phaser.Input.Pointer): void {
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
    this.aimKnob.set(this.aimBase.x, this.aimBase.y);
    this.aimVector.set(0, 0);
    this.renderAimJoystick();
  }

  private renderAimJoystick(): void {
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
      .circle(config.x, config.y, config.radius, config.fill, 0.44)
      .setStrokeStyle(3, config.accent, 0.76)
      .setScrollFactor(0)
      .setDepth(Depth.MobileControls);
    const gloss = this.scene.add
      .circle(
        config.x - config.radius * 0.26,
        config.y - config.radius * 0.28,
        config.radius * 0.28,
        0xffffff,
        0.12,
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
    ring.setAlpha(pressed ? 0.78 : 1);
    gloss.setAlpha(pressed ? 0.2 : 0.12);
  }
}

function buttonConfigs(layout: BattleMobileControlsLayout): ButtonConfig[] {
  const right = layout.width;
  const bottom = layout.height;
  return [
    {
      action: "switch",
      x: right - 112,
      y: 76,
      radius: 43,
      label: t("battle.mobile_switch"),
      fill: 0x26384c,
      accent: 0xffcf6e,
    },
    {
      action: "reload",
      x: right - 112,
      y: 176,
      radius: 55,
      label: t("battle.mobile_reload"),
      fill: 0x253346,
      accent: 0x8af7ff,
    },
    {
      action: "shoot",
      x: right - 104,
      y: bottom - 96,
      radius: 64,
      label: t("battle.mobile_shoot"),
      fill: 0x4b2734,
      accent: 0xff6b8a,
    },
    {
      action: "bomb",
      x: right - 232,
      y: bottom - 92,
      radius: 48,
      label: t("battle.mobile_bomb"),
      fill: 0x382d4f,
      accent: 0xc8a7ff,
    },
    {
      action: "activeCard",
      x: right - 332,
      y: bottom - 92,
      radius: 47,
      label: t("battle.mobile_card"),
      fill: 0x233f3f,
      accent: 0x70f0c8,
    },
  ];
}

function axisToDigital(value: number): -1 | 0 | 1 {
  if (value > JOYSTICK_DEAD_ZONE) return 1;
  if (value < -JOYSTICK_DEAD_ZONE) return -1;
  return 0;
}
