import type { BattleInputState } from "@repo/raid-logic";
import type { PointRewardSize } from "@repo/constants";

export type DebugPointSize = "small" | "medium" | "large";

export function pointRewardSizeForDebugSize(size: DebugPointSize): PointRewardSize {
  switch (size) {
    case "small":
      return "small";
    case "medium":
      return "medium";
    case "large":
      return "large";
  }
}

export function createPresetScriptInput(offset: number): BattleInputState {
  const aimAngle = -0.5 + offset * 0.018;
  return {
    moveX: presetMoveX(offset),
    moveY: presetMoveY(offset),
    aimX: 640 + Math.cos(aimAngle) * 390,
    aimY: 338 + Math.sin(aimAngle) * 250,
    shootPressed: isPresetShootFrame(offset),
    bombPressed: isPresetBombFrame(offset),
    activeCardPressed: offset === 320,
    reloadPressed: isPresetReloadFrame(offset),
    alternateHeld: isPresetAlternateHeld(offset),
    infoHeld: false,
  };
}

export function describePresetScriptAction(offset: number): string {
  const actions: string[] = [];
  if (isPresetAlternateHeld(offset)) actions.push("alternateHeld");
  if (isPresetShootFrame(offset)) actions.push("shoot");
  if (isPresetReloadFrame(offset)) actions.push("reload");
  if (isPresetBombFrame(offset)) actions.push("bomb");
  if (offset === 150) actions.push("marisaBombStart");
  if (
    offset > 150 &&
    offset < 390 &&
    (isPresetAlternateHeld(offset) ||
      isPresetShootFrame(offset) ||
      isPresetReloadFrame(offset) ||
      isPresetBombFrame(offset))
  ) {
    actions.push("duringMarisaBombLock");
  }
  if (offset === 320) actions.push("activeCard");
  return actions.length === 0 ? "move+aim" : actions.join("+");
}

function presetMoveX(offset: number): -1 | 0 | 1 {
  if (offset < 36) return 1;
  if (offset < 72) return -1;
  if (offset >= 155 && offset < 260) {
    return offset % 32 < 16 ? 1 : -1;
  }
  if (offset >= 260 && offset < 330) return 1;
  return offset % 48 < 16 ? -1 : offset % 48 < 32 ? 1 : 0;
}

function presetMoveY(offset: number): -1 | 0 | 1 {
  if (offset < 28) return -1;
  if (offset < 64) return 1;
  if (offset >= 155 && offset < 260) {
    return offset % 28 < 14 ? -1 : 1;
  }
  return offset % 42 < 14 ? 1 : offset % 42 < 28 ? -1 : 0;
}

function isPresetShootFrame(offset: number): boolean {
  return [4, 10, 18, 35, 78, 90, 118, 146, 166, 174, 182, 205, 238, 274, 330, 360, 390].includes(offset);
}

function isPresetReloadFrame(offset: number): boolean {
  return [22, 52, 104, 132, 176, 215, 285, 345].includes(offset);
}

function isPresetBombFrame(offset: number): boolean {
  return [64, 150, 188, 250, 404].includes(offset);
}

function isPresetAlternateHeld(offset: number): boolean {
  return (
    (offset >= 72 && offset < 122) ||
    (offset >= 144 && offset < 248) ||
    (offset >= 255 && offset < 305) ||
    (offset >= 350 && offset < 382)
  );
}
