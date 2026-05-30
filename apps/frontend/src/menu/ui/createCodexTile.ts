import Phaser from "phaser";

import type { CharacterTileControl } from "../shared";

import { createEntryTile } from "./entryTile";

export function createCodexTile(
  scene: Phaser.Scene,
  x: number,
  y: number,
  title: string,
  cost: number,
  tag: string,
  selected: boolean,
  drawIcon: (target: Phaser.GameObjects.Container) => void,
  onClick: () => void,
): CharacterTileControl {
  return createEntryTile(scene, x, y, {
    width: 164,
    height: 142,
    title,
    subtitle: `cost${cost}`,
    badge: tag,
    selected,
    onClick,
    drawIcon,
  });
}