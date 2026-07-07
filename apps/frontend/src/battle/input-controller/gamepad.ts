import Phaser from "phaser";
import { ARENA_HEIGHT_PX, ARENA_WIDTH_PX, type ArenaBounds } from "@repo/constants";

export type JoystickAxisSource = "dpad" | "leftStick" | "rightStick";

export type JoystickButtonInput =
  | "A"
  | "B"
  | "X"
  | "Y"
  | "LB"
  | "RB"
  | "LT"
  | "RT"
  | "MENU";

export interface JoystickSettings {
  move: JoystickAxisSource;
  aim: JoystickAxisSource;
  shoot: JoystickButtonInput;
  bomb: JoystickButtonInput;
  alternate: JoystickButtonInput;
  reload: JoystickButtonInput;
  activeCard: JoystickButtonInput;
  info: JoystickButtonInput;
  enter: JoystickButtonInput;
  pause: JoystickButtonInput;
  leftStickSensitivity: number;
  rightStickSensitivity: number;
}

export interface JoystickInputState {
  readonly moveX: -1 | 0 | 1;
  readonly moveY: -1 | 0 | 1;
  readonly aimX: number | undefined;
  readonly aimY: number | undefined;
  readonly shootPressed: boolean;
  readonly bombPressed: boolean;
  readonly activeCardPressed: boolean;
  readonly reloadPressed: boolean;
  readonly alternateHeld: boolean;
  readonly infoHeld: boolean;
  readonly enterPressed: boolean;
  readonly pausePressed: boolean;
}

export interface JoystickPauseMenuState {
  readonly moveY: -1 | 0 | 1;
  readonly bombPressed: boolean;
  readonly pausePressed: boolean;
}

export type InputProfileId = "keyboard" | "mobile" | `joystick:${number}`;

export interface AccountSettings {
  p1Input: InputProfileId;
  p2Input: InputProfileId;
  p1ProfileId: string;
  p2ProfileId: string;
  battleProfile: "Player1" | "Player2";
  p1Username: string;
  p2Username: string;
}

export const DEFAULT_ACCOUNT_SETTINGS: AccountSettings = {
  p1Input: "keyboard",
  p2Input: "mobile",
  p1ProfileId: "default",
  p2ProfileId: "default",
  battleProfile: "Player1",
  p1Username: "Player 1",
  p2Username: "Player 2",
};

export const DEFAULT_JOYSTICK_SETTINGS: JoystickSettings = {
  move: "dpad",
  aim: "rightStick",
  shoot: "RT",
  bomb: "RB",
  alternate: "LT",
  reload: "LB",
  activeCard: "A",
  info: "B",
  enter: "X",
  pause: "MENU",
  leftStickSensitivity: 1,
  rightStickSensitivity: 1,
};

const STICK_DEADZONE = 0.25;
const TRIGGER_THRESHOLD = 0.5;
const AIM_SPEED_PX_PER_TICK = 13;

export class BattleJoystickController {
  private previousButtons = new Map<JoystickButtonInput, boolean>();
  private menuPreviousButtons = new Map<JoystickButtonInput, boolean>();
  private aimX = ARENA_WIDTH_PX / 2;
  private aimY = ARENA_HEIGHT_PX / 2;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly settings: JoystickSettings,
    private readonly padIndex = 0,
  ) {
    this.scene.input.gamepad?.gamepads.forEach((pad) => pad?.setAxisThreshold?.(STICK_DEADZONE));
  }

  readState(arenaBounds?: ArenaBounds): JoystickInputState | undefined {
    const pad = this.getPad();
    if (!pad) {
      this.previousButtons.clear();
      return undefined;
    }

    const moveVector = readAxis(pad, this.settings.move, this.settings);
    const aimVector = readAxis(pad, this.settings.aim, this.settings);
    const aimMagnitude = Math.hypot(aimVector.x, aimVector.y);
    if (aimMagnitude >= STICK_DEADZONE) {
      this.aimX = Phaser.Math.Clamp(
        this.aimX + aimVector.x * AIM_SPEED_PX_PER_TICK,
        0,
        arenaBounds?.width ?? ARENA_WIDTH_PX,
      );
      this.aimY = Phaser.Math.Clamp(
        this.aimY + aimVector.y * AIM_SPEED_PX_PER_TICK,
        0,
        arenaBounds?.height ?? ARENA_HEIGHT_PX,
      );
    }

    return {
      moveX: axisToDigital(moveVector.x),
      moveY: axisToDigital(moveVector.y),
      aimX: this.aimX,
      aimY: this.aimY,
      shootPressed: isButtonDown(pad, this.settings.shoot),
      bombPressed: isButtonDown(pad, this.settings.bomb),
      activeCardPressed: this.justPressed(pad, this.settings.activeCard),
      reloadPressed: this.justPressed(pad, this.settings.reload),
      alternateHeld: isButtonDown(pad, this.settings.alternate),
      infoHeld: isButtonDown(pad, this.settings.info),
      enterPressed: this.justPressed(pad, this.settings.enter),
      pausePressed: this.justPressed(pad, this.settings.pause),
    };
  }

  readPausePressed(): boolean {
    const pad = this.getPad();
    if (!pad) {
      this.menuPreviousButtons.clear();
      return false;
    }
    return this.justPressedForMenu(pad, this.settings.pause);
  }

  readPauseMenuState(): JoystickPauseMenuState | undefined {
    const pad = this.getPad();
    if (!pad) {
      this.menuPreviousButtons.clear();
      return undefined;
    }
    const moveVector = readAxis(pad, this.settings.move, this.settings);
    return {
      moveY: axisToDigital(moveVector.y),
      bombPressed: this.justPressedForMenu(pad, this.settings.bomb),
      pausePressed: this.justPressedForMenu(pad, this.settings.pause),
    };
  }

  private getPad(): Phaser.Input.Gamepad.Gamepad | undefined {
    const gamepadPlugin = this.scene.input.gamepad;
    if (!gamepadPlugin || gamepadPlugin.total <= 0) {
      return undefined;
    }
    return gamepadPlugin.gamepads[this.padIndex] ?? undefined;
  }

  private justPressed(pad: Phaser.Input.Gamepad.Gamepad, input: JoystickButtonInput): boolean {
    const down = isButtonDown(pad, input);
    const wasDown = this.previousButtons.get(input) ?? false;
    this.previousButtons.set(input, down);
    return down && !wasDown;
  }

  private justPressedForMenu(pad: Phaser.Input.Gamepad.Gamepad, input: JoystickButtonInput): boolean {
    const down = isButtonDown(pad, input);
    const wasDown = this.menuPreviousButtons.get(input) ?? false;
    this.menuPreviousButtons.set(input, down);
    return down && !wasDown;
  }
}

function readAxis(
  pad: Phaser.Input.Gamepad.Gamepad,
  source: JoystickAxisSource,
  settings: JoystickSettings,
): { readonly x: number; readonly y: number } {
  if (source === "dpad") {
    return {
      x: (pad.right ? 1 : 0) - (pad.left ? 1 : 0),
      y: (pad.down ? 1 : 0) - (pad.up ? 1 : 0),
    };
  }
  const rawX = source === "leftStick" ? pad.axes?.[0]?.getValue?.() : pad.axes?.[2]?.getValue?.();
  const rawY = source === "leftStick" ? pad.axes?.[1]?.getValue?.() : pad.axes?.[3]?.getValue?.();
  const stick = source === "leftStick" ? pad.leftStick : pad.rightStick;
  const x = Number.isFinite(rawX) ? Number(rawX) : stick.x;
  const y = Number.isFinite(rawY) ? Number(rawY) : stick.y;
  const sensitivity = source === "leftStick" ? settings.leftStickSensitivity : settings.rightStickSensitivity;
  return scaleStick(x, y, sensitivity);
}

function axisToDigital(value: number): -1 | 0 | 1 {
  if (value > STICK_DEADZONE) return 1;
  if (value < -STICK_DEADZONE) return -1;
  return 0;
}

function isButtonDown(pad: Phaser.Input.Gamepad.Gamepad, input: JoystickButtonInput): boolean {
  switch (input) {
    case "A":
      return Boolean(pad.A);
    case "B":
      return Boolean(pad.B);
    case "X":
      return Boolean(pad.X);
    case "Y":
      return Boolean(pad.Y);
    case "LB":
      return Number(pad.L1) > TRIGGER_THRESHOLD;
    case "RB":
      return Number(pad.R1) > TRIGGER_THRESHOLD;
    case "LT":
      return Number(pad.L2) > TRIGGER_THRESHOLD;
    case "RT":
      return Number(pad.R2) > TRIGGER_THRESHOLD;
    case "MENU":
      return Boolean(pad.buttons?.[9]?.pressed ?? pad.getButtonValue?.(9));
  }
}

function scaleStick(x: number, y: number, sensitivity: number): { readonly x: number; readonly y: number } {
  const normalizedSensitivity = normalizeSensitivity(sensitivity);
  return {
    x: Math.abs(x) >= STICK_DEADZONE ? Phaser.Math.Clamp(x * normalizedSensitivity, -1, 1) : 0,
    y: Math.abs(y) >= STICK_DEADZONE ? Phaser.Math.Clamp(y * normalizedSensitivity, -1, 1) : 0,
  };
}

export function normalizeJoystickSettings(value: Partial<JoystickSettings> | undefined): JoystickSettings {
  return {
    ...DEFAULT_JOYSTICK_SETTINGS,
    ...(value ?? {}),
    leftStickSensitivity: normalizeSensitivity(value?.leftStickSensitivity),
    rightStickSensitivity: normalizeSensitivity(value?.rightStickSensitivity),
  };
}

export function normalizeSensitivity(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Phaser.Math.Clamp(value, 0.4, 2)
    : 1;
}
