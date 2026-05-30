import Phaser from "phaser";

import type { AbilityCardDefinition } from "@repo/content";

import type { CardTileControl } from "../shared";

import { createEntryTile } from "./entryTile";
import { drawCardIcon } from "./drawCardIcon";

export function createCardTile(
  scene: Phaser.Scene,
  x: number,
  y: number,
  card: AbilityCardDefinition,
  selected: boolean,
  onClick: () => void,
): CardTileControl {
  return createEntryTile(scene, x, y, {
    width: 116,
    height: 104,
    title: card.name,
    subtitle: `${card.kind === "active" ? "主动" : "被动"} cost${card.cost}`,
    badge: card.kind === "active" ? "主动使用" : "被动",
    selected,
    onClick,
    drawIcon: (target) => drawCardIcon(scene, target, 58, 34, card.kind, 0.76),
  });
}