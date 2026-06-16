import { describe, expect, it, vi } from "vitest";

vi.mock("phaser", () => ({
  default: {
    Input: {
      Keyboard: {
        JustDown: (key: { _justDown?: boolean }) => {
          const justDown = key._justDown === true;
          key._justDown = false;
          return justDown;
        },
      },
    },
    Math: {
      Clamp: (value: number, min: number, max: number) =>
        Math.max(min, Math.min(max, value)),
    },
  },
}));

import { createBattleInput, type BattleKeyMap } from "./input-controller/input";
import type { BattleMobileControls } from "./input-controller";
import { BattleJoystickController, DEFAULT_JOYSTICK_SETTINGS } from "./input-controller/gamepad";

describe("createBattleInput", () => {
  it("truncates mobile aim coordinates before building logic input", () => {
    const input = createBattleInput(
      createSceneStub(),
      createKeys(),
      {
        readState: () => ({
          moveX: 0,
          moveY: 0,
          aimX: 312.9,
          aimY: 456.8,
          shootPressed: false,
          bombPressed: false,
          activeCardPressed: false,
          reloadPressed: false,
          alternateHeld: false,
        }),
        aimWorld: () => ({ x: 312.9, y: 456.8 }),
      } as BattleMobileControls,
    );

    expect(input.aimX).toBe(312);
    expect(input.aimY).toBe(456);
  });

  it("moves joystick aim from right stick state", () => {
    const scene = createSceneStub({
      input: {
        gamepad: {
          total: 1,
          gamepads: [createPadStub({ rightStickX: 1, rightStickY: 0 })],
        },
      },
    });
    const joystick = new BattleJoystickController(scene, DEFAULT_JOYSTICK_SETTINGS);

    const input = createBattleInput(
      scene,
      createKeys(),
      {
        joystickControls: joystick,
        keyboardEnabled: false,
        pointerEnabled: false,
        arenaBounds: { width: 1280, height: 720, viewportWidth: 1280, viewportHeight: 720 },
      },
    );

    expect(input.aimX).toBe(613);
    expect(input.aimY).toBe(360);
    expect(input.pointerX).toBe(613);
    expect(input.pointerY).toBe(360);
  });
});

function createSceneStub(overrides: { readonly input?: Record<string, unknown> } = {}) {
  const pointer = {
    x: 0,
    y: 0,
    leftButtonDown: () => false,
    rightButtonDown: () => false,
    positionToCamera: () => ({ x: 0, y: 0 }),
  };
  return {
    input: { activePointer: pointer, ...overrides.input },
    cameras: { main: {} },
  } as never;
}

function createPadStub({
  rightStickX,
  rightStickY,
}: {
  readonly rightStickX: number;
  readonly rightStickY: number;
}) {
  return {
    axes: [
      { getValue: () => 0 },
      { getValue: () => 0 },
      { getValue: () => rightStickX },
      { getValue: () => rightStickY },
    ],
    leftStick: { x: 0, y: 0 },
    rightStick: { x: rightStickX, y: rightStickY },
    setAxisThreshold: vi.fn(),
  };
}

function createKeys(): BattleKeyMap {
  const key = { isDown: false };
  return {
    moveUp: key,
    moveLeft: key,
    moveDown: key,
    moveRight: key,
    alternate: key,
    reload: key,
    info: key,
    activeCard: key,
    w: key,
    a: key,
    s: key,
    d: key,
    shift: key,
    r: key,
    tab: key,
    enter: key,
    e: key,
  } as unknown as BattleKeyMap;
}
