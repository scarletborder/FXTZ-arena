import type { FrameInput, PlayerFrameInput, PlayerId } from "@repo/types";

import { ANGLE_TICKS_PER_TURN } from "./constants";

const INPUT_BYTE_LENGTH = 6;

export interface RaidFrameInput {
  readonly frame: number;
  readonly playerId: PlayerId;
  readonly moveX: -1 | 0 | 1;
  readonly moveY: -1 | 0 | 1;
  readonly aimAngleTicks: number;
  readonly shootPressed: boolean;
  readonly bombPressed: boolean;
  readonly activeCardPressed: boolean;
  readonly reloadPressed: boolean;
  readonly alternateHeld: boolean;
  readonly infoHeld: boolean;
}

export function normalizeAngleTicks(angleTicks: number): number {
  const normalized = Math.trunc(angleTicks) % ANGLE_TICKS_PER_TURN;
  return normalized < 0 ? normalized + ANGLE_TICKS_PER_TURN : normalized;
}

export function radiansToAngleTicks(radians: number): number {
  return normalizeAngleTicks(
    Math.round((radians / (Math.PI * 2)) * ANGLE_TICKS_PER_TURN),
  );
}

export function vectorToAngleTicks(x: number, y: number): number {
  if (x === 0 && y === 0) {
    return 0;
  }

  return radiansToAngleTicks(Math.atan2(y, x));
}

export function createEmptyInput(
  frame: number,
  playerId: PlayerId,
): RaidFrameInput {
  return {
    frame,
    playerId,
    moveX: 0,
    moveY: 0,
    aimAngleTicks: 0,
    shootPressed: false,
    bombPressed: false,
    activeCardPressed: false,
    reloadPressed: false,
    alternateHeld: false,
    infoHeld: false,
  };
}

export function fromPlayerFrameInput(
  playerId: PlayerId,
  input: PlayerFrameInput,
): RaidFrameInput {
  return {
    frame: input.frame,
    playerId,
    moveX: input.moveX,
    moveY: input.moveY,
    aimAngleTicks: vectorToAngleTicks(input.aimX, input.aimY),
    shootPressed: input.shootPressed,
    bombPressed: input.bombPressed,
    activeCardPressed: input.activeCardPressed,
    reloadPressed: input.reloadPressed,
    alternateHeld: input.alternateHeld,
    infoHeld: input.infoHeld,
  };
}

export function fromLegacyFrameInput(input: FrameInput): RaidFrameInput {
  return {
    frame: input.frame,
    playerId: input.playerId,
    moveX: input.moveX,
    moveY: input.moveY,
    aimAngleTicks: radiansToAngleTicks(input.aimRadians),
    shootPressed: input.fire,
    bombPressed: input.bomb,
    activeCardPressed: false,
    reloadPressed: input.reload,
    alternateHeld: input.switchCharacter,
    infoHeld: false,
  };
}

export function encodeInput(input: RaidFrameInput): Uint8Array {
  const output = new Uint8Array(INPUT_BYTE_LENGTH);
  output[0] = input.moveX + 1;
  output[1] = input.moveY + 1;

  const angleTicks = normalizeAngleTicks(input.aimAngleTicks);
  output[2] = angleTicks & 0xff;
  output[3] = (angleTicks >>> 8) & 0xff;

  let buttons = 0;
  buttons |= input.shootPressed ? 1 << 0 : 0;
  buttons |= input.bombPressed ? 1 << 1 : 0;
  buttons |= input.activeCardPressed ? 1 << 2 : 0;
  buttons |= input.reloadPressed ? 1 << 3 : 0;
  buttons |= input.alternateHeld ? 1 << 4 : 0;
  buttons |= input.infoHeld ? 1 << 5 : 0;
  output[4] = buttons;
  output[5] = 0;

  return output;
}

export function decodeInput(
  frame: number,
  playerId: PlayerId,
  data: Uint8Array | undefined,
): RaidFrameInput {
  if (!data || data.length < INPUT_BYTE_LENGTH) {
    return createEmptyInput(frame, playerId);
  }

  const buttons = data[4] ?? 0;
  return {
    frame,
    playerId,
    moveX: decodeAxis(data[0]),
    moveY: decodeAxis(data[1]),
    aimAngleTicks: normalizeAngleTicks((data[2] ?? 0) | ((data[3] ?? 0) << 8)),
    shootPressed: (buttons & (1 << 0)) !== 0,
    bombPressed: (buttons & (1 << 1)) !== 0,
    activeCardPressed: (buttons & (1 << 2)) !== 0,
    reloadPressed: (buttons & (1 << 3)) !== 0,
    alternateHeld: (buttons & (1 << 4)) !== 0,
    infoHeld: (buttons & (1 << 5)) !== 0,
  };
}

function decodeAxis(value: number | undefined): -1 | 0 | 1 {
  if (value === 0) {
    return -1;
  }

  if (value === 2) {
    return 1;
  }

  return 0;
}
